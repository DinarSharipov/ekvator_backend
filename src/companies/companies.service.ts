import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CompanyLedgerKind, CompanyMemberRole, CompanyTopUpStatus, Prisma, UserRole } from "../generated/prisma/client";
import { PasswordService } from "../auth/password.service";
import { AuthenticatedUser, ServiceAccessService } from "../auth/service-access.service";
import { phoneLookupKey } from "../users/phone";
import { PrismaService } from "../prisma/prisma.service";
import { AddCompanyEmployeeDto, AllocateCompanyBalanceDto, ChargeCompanyQrDto, CreateCompanyDto, CreateCompanyTopUpDto } from "./dto/company.dto";

const companyLockNamespace = 74_161;
const maxMoneyMinor = 2_147_483_647;
const userSelect = { id: true, name: true, surname: true, login: true, phone: true, email: true } satisfies Prisma.UserSelect;
const companyInclude = { members: { orderBy: { id: "asc" }, include: { user: { select: userSelect } } } } satisfies Prisma.CompanyInclude;
const topUpInclude = { createdBy: { select: userSelect }, confirmedBy: { select: userSelect } } satisfies Prisma.CompanyTopUpInclude;
type Actor = { id: number; userRole: UserRole };

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService, private readonly serviceAccess: ServiceAccessService) {}

  async create(actor: Actor, dto: CreateCompanyDto) {
    return this.presentCompany(await this.prisma.company.create({
      data: { name: dto.name, inn: dto.inn, createdById: actor.id, members: { create: { userId: actor.id, role: CompanyMemberRole.owner, qrToken: this.qrToken() } } },
      include: companyInclude,
    }));
  }

  async myCompanies(actor: Actor) {
    return (await this.prisma.company.findMany({
      where: actor.userRole === UserRole.admin ? undefined : { members: { some: { userId: actor.id, isActive: true } } },
      include: companyInclude,
      orderBy: { id: "asc" },
    })).map((company) => this.presentCompany(company));
  }

  async getCompany(actor: Actor, companyId: number) {
    await this.assertMember(actor, companyId);
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, include: companyInclude });
    if (!company) throw new NotFoundException("Компания не найдена");
    return this.presentCompany(company);
  }

  async addEmployee(actor: Actor, companyId: number, dto: AddCompanyEmployeeDto) {
    await this.assertOwner(actor, companyId);
    return this.prisma.$transaction(async (tx) => {
      let userId = dto.userId;
      if (!userId) {
        try {
          const password = await this.passwords.hash(dto.password!);
          const user = await tx.user.create({ data: { login: dto.login!, password, name: dto.name!, phone: dto.phone, phoneNormalized: phoneLookupKey(dto.phone), userRole: UserRole.user, role: UserRole.user }, select: { id: true } });
          userId = user.id;
        } catch (error) { this.rethrowWriteError(error); }
      } else if (!await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) {
        throw new NotFoundException("Пользователь не найден");
      }
      try {
        return this.presentMember(await tx.companyMember.create({ data: { companyId, userId, qrToken: this.qrToken() }, include: { user: { select: userSelect } } }));
      } catch (error) { this.rethrowWriteError(error); }
    });
  }

  async createTopUp(actor: Actor, companyId: number, dto: CreateCompanyTopUpDto) {
    await this.assertOwner(actor, companyId);
    return this.prisma.companyTopUp.create({ data: { companyId, amountMinor: dto.amountMinor, note: dto.note, createdById: actor.id }, include: topUpInclude });
  }

  async listTopUps(actor: Actor, companyId: number) {
    await this.assertMember(actor, companyId);
    return this.prisma.companyTopUp.findMany({ where: { companyId }, orderBy: { createdAt: "desc" }, include: topUpInclude });
  }

  async confirmTopUp(actor: Actor, topUpId: number) {
    if (actor.userRole !== UserRole.admin) throw new ForbiddenException("Подтверждать пополнения может только администратор Экватора");
    return this.prisma.$transaction(async (tx) => {
      const topUp = await tx.companyTopUp.findUnique({ where: { id: topUpId } });
      if (!topUp) throw new NotFoundException("Заявка на пополнение не найдена");
      await this.lockCompany(tx, topUp.companyId);
      // The second read happens after the advisory lock, so two confirmations cannot credit one request twice.
      const pendingTopUp = await tx.companyTopUp.findUnique({ where: { id: topUpId } });
      if (!pendingTopUp || pendingTopUp.status !== CompanyTopUpStatus.pending) throw new ConflictException("Заявка уже обработана");
      const company = await tx.company.update({ where: { id: pendingTopUp.companyId }, data: { balanceMinor: { increment: pendingTopUp.amountMinor } } });
      const confirmed = await tx.companyTopUp.update({ where: { id: topUpId }, data: { status: CompanyTopUpStatus.confirmed, confirmedAt: new Date(), confirmedById: actor.id }, include: topUpInclude });
      await tx.companyLedgerEntry.create({ data: { companyId: company.id, kind: CompanyLedgerKind.top_up, amountMinor: pendingTopUp.amountMinor, reference: `top-up:${pendingTopUp.id}`, createdById: actor.id } });
      return { topUp: confirmed, companyBalanceMinor: company.balanceMinor };
    });
  }

  async allocate(actor: Actor, companyId: number, memberId: number, dto: AllocateCompanyBalanceDto) {
    await this.assertOwner(actor, companyId);
    return this.prisma.$transaction(async (tx) => {
      await this.lockCompany(tx, companyId);
      const [company, member] = await Promise.all([
        tx.company.findUnique({ where: { id: companyId } }),
        tx.companyMember.findFirst({ where: { id: memberId, companyId, role: CompanyMemberRole.employee, isActive: true } }),
      ]);
      if (!company) throw new NotFoundException("Компания не найдена");
      if (!member) throw new NotFoundException("Активный сотрудник компании не найден");
      if (company.balanceMinor < dto.amountMinor) throw new ConflictException("Недостаточно средств на корпоративном балансе");
      const transferId = randomUUID();
      const updatedCompany = await tx.company.update({ where: { id: companyId }, data: { balanceMinor: { decrement: dto.amountMinor } } });
      const updatedMember = await tx.companyMember.update({ where: { id: memberId }, data: { balanceMinor: { increment: dto.amountMinor } } });
      await tx.companyLedgerEntry.createMany({ data: [
        { companyId, kind: CompanyLedgerKind.allocation, amountMinor: -dto.amountMinor, transferId, reference: dto.note, createdById: actor.id },
        { companyId, companyMemberId: memberId, kind: CompanyLedgerKind.allocation, amountMinor: dto.amountMinor, transferId, reference: dto.note, createdById: actor.id },
      ] });
      return { companyId, memberId, amountMinor: dto.amountMinor, note: dto.note ?? null, companyBalanceMinor: updatedCompany.balanceMinor, memberBalanceMinor: updatedMember.balanceMinor, transferId, createdAt: new Date() };
    });
  }

  async memberQr(actor: Actor, companyId: number, memberId: number) {
    const member = await this.prisma.companyMember.findFirst({ where: { id: memberId, companyId }, include: { user: { select: userSelect } } });
    if (!member) throw new NotFoundException("Сотрудник компании не найден");
    if (actor.userRole !== UserRole.admin && actor.id !== member.userId) await this.assertOwner(actor, companyId);
    return { companyId, memberId: member.id, employee: member.user, qrToken: member.qrToken, expiresAt: null, balanceMinor: member.balanceMinor, isActive: member.isActive };
  }

  async chargeByQr(actor: AuthenticatedUser, dto: ChargeCompanyQrDto) {
    const quantity = dto.quantity ?? 1;
    return this.prisma.$transaction(async (tx) => {
      const [member, serviceElement] = await Promise.all([
        tx.companyMember.findUnique({ where: { qrToken: dto.qrToken } }),
        tx.serviceElement.findUnique({ where: { id: dto.serviceElementId } }),
      ]);
      if (!member || !member.isActive) throw new NotFoundException("Активный сотрудник по QR-коду не найден");
      if (!serviceElement || serviceElement.isArchive) throw new NotFoundException("Товар или услуга не найдены");
      this.serviceAccess.assertCanAccessServices(actor, [serviceElement.type]);
      const amountMinor = Math.round(serviceElement.price * 100) * quantity;
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor > maxMoneyMinor) throw new ConflictException("Для позиции задана некорректная цена");
      await this.lockCompany(tx, member.companyId);
      const currentMember = await tx.companyMember.findUnique({ where: { id: member.id } });
      if (!currentMember?.isActive || currentMember.balanceMinor < amountMinor) throw new ConflictException("Недостаточно средств на депозите сотрудника");
      const updated = await tx.companyMember.update({ where: { id: member.id }, data: { balanceMinor: { decrement: amountMinor } } });
      const entry = await tx.companyLedgerEntry.create({ data: { companyId: member.companyId, companyMemberId: member.id, kind: CompanyLedgerKind.spend, amountMinor: -amountMinor, reference: `service-element:${serviceElement.id};quantity:${quantity}`, createdById: actor.id } });
      return { companyId: member.companyId, memberId: member.id, serviceElementId: serviceElement.id, quantity, amountMinor, memberBalanceMinor: updated.balanceMinor, ledgerEntryId: entry.id };
    });
  }

  async ledger(actor: Actor, companyId: number) {
    await this.assertOwner(actor, companyId);
    const [company, entries] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId }, select: { balanceMinor: true, members: { select: { id: true, balanceMinor: true } } } }),
      this.prisma.companyLedgerEntry.findMany({ where: { companyId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { companyMember: { include: { user: { select: userSelect } } } } }),
    ]);
    const balances = new Map<string, number>([["company", company?.balanceMinor ?? 0], ...(company?.members ?? []).map((member) => [`member:${member.id}`, member.balanceMinor] as const)]);
    return entries.map((entry) => {
      const key = entry.companyMemberId ? `member:${entry.companyMemberId}` : "company";
      const balanceAfterMinor = balances.get(key) ?? 0;
      const balanceBeforeMinor = balanceAfterMinor - entry.amountMinor;
      balances.set(key, balanceBeforeMinor);
      return { ...entry, companyMember: entry.companyMember ? this.presentMember(entry.companyMember) : null, balanceBeforeMinor, balanceAfterMinor, relatedTopUpId: this.referenceId(entry.reference, "top-up"), relatedServiceElementId: this.referenceId(entry.reference, "service-element") };
    });
  }

  private presentCompany<T extends { balanceMinor: number; members: { role: CompanyMemberRole; balanceMinor: number }[] }>(company: T) {
    const members = company.members.map((member) => this.presentMember(member));
    return { ...company, members, unallocatedBalanceMinor: company.balanceMinor, corporateBalanceMinor: company.balanceMinor + members.reduce((sum, member) => sum + member.balanceMinor, 0), owner: members.find((member) => member.role === CompanyMemberRole.owner) ?? null };
  }
  private presentMember<T extends object>(member: T) { const { qrToken: _qrToken, ...safeMember } = member as T & { qrToken?: string }; return safeMember as Omit<T, "qrToken">; }
  private referenceId(reference: string | null, kind: "top-up" | "service-element") { const match = reference?.match(new RegExp(`(?:^|;)${kind}:(\\d+)`)); return match ? Number(match[1]) : null; }

  private async assertMember(actor: Actor, companyId: number) {
    if (actor.userRole === UserRole.admin) return;
    const member = await this.prisma.companyMember.findFirst({ where: { companyId, userId: actor.id, isActive: true } });
    if (!member) throw new ForbiddenException("Нет доступа к компании");
  }

  private async assertOwner(actor: Actor, companyId: number) {
    if (actor.userRole === UserRole.admin) return;
    const owner = await this.prisma.companyMember.findFirst({ where: { companyId, userId: actor.id, role: CompanyMemberRole.owner, isActive: true } });
    if (!owner) throw new ForbiddenException("Управлять компанией может только её владелец");
  }

  private async lockCompany(tx: Prisma.TransactionClient, companyId: number) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(${companyLockNamespace}, ${companyId})`; }
  private qrToken() { return `ekvator-company-v1:${randomUUID()}`; }
  private rethrowWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("Пользователь уже состоит в этой компании либо логин или телефон уже используются");
    throw error;
  }
}
