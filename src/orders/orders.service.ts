import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { BookingMode, PreorderStatus, Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AddCartItemDto, UpdateCartItemDto } from "./dto/cart.dto";
import { CheckoutDto } from "./dto/checkout.dto";
import { PostponeOrderDto, ProposeScheduleDto, SetOrderStatusDto } from "./dto/order-actions.dto";

const orderInclude = {
  user: { select: { id: true, name: true, surname: true, login: true, phone: true } },
  items: { orderBy: { id: "asc" }, include: { serviceType: { select: { id: true, name: true, bookingMode: true, bookingCapacity: true } } } },
} satisfies Prisma.PreorderInclude;

const terminalStatuses = new Set<PreorderStatus>([PreorderStatus.completed, PreorderStatus.rejected, PreorderStatus.cancelled]);
const cartLockNamespace = 74_159;
const bookingLockNamespace = 74_160;
type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class OrdersService implements OnModuleInit, OnModuleDestroy {
  private overdueTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.overdueTimer = setInterval(() => void this.completeOverdueOrders(), 60_000);
    this.overdueTimer.unref();
  }

  onModuleDestroy() { if (this.overdueTimer) clearInterval(this.overdueTimer); }

  async getCart(userId: number) {
    return this.prisma.cart.findUnique({ where: { userId }, include: { items: { include: { serviceElement: true }, orderBy: { id: "asc" } } } })
      ?? { id: null, userId, items: [] };
  }

  async addCartItem(userId: number, dto: AddCartItemDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, userId);
      const item = await tx.serviceElement.findUnique({ where: { id: dto.serviceElementId } });
      if (!item) throw new NotFoundException("Товар или услуга не найдены");
      if (item.isArchive || !item.preorderAvailable) throw new ConflictException("Позиция сейчас недоступна для предзаказа");
      const cart = await tx.cart.upsert({ where: { userId }, create: { userId }, update: {} });
      const existingItems = await tx.cartItem.findMany({ where: { cartId: cart.id }, include: { serviceElement: { select: { type: true } } } });
      const typeIds = [...new Set([...existingItems.map((cartItem) => cartItem.serviceElement.type), item.type])];
      const types = await tx.serviceType.findMany({ where: { id: { in: typeIds } } });
      this.assertCartCompatibility(types, typeIds.length);
      const itemType = types.find((type) => type.id === item.type)!;
      if (!itemType.acceptsPreorders) throw new ConflictException("Сервис сейчас не принимает предзаказы");
      await tx.cartItem.upsert({
        where: { cartId_serviceElementId: { cartId: cart.id, serviceElementId: dto.serviceElementId } },
        create: { cartId: cart.id, serviceElementId: dto.serviceElementId, quantity: dto.quantity },
        update: { quantity: dto.quantity },
      });
    });
    return this.getCart(userId);
  }

  async updateCartItem(userId: number, itemId: number, dto: UpdateCartItemDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, userId);
      const cart = await this.requireCart(tx, userId);
      const result = await tx.cartItem.updateMany({ where: { id: itemId, cartId: cart.id }, data: { quantity: dto.quantity } });
      if (!result.count) throw new NotFoundException("Позиция корзины не найдена");
    });
    return this.getCart(userId);
  }

  async removeCartItem(userId: number, itemId: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, userId);
      const cart = await this.requireCart(tx, userId);
      const result = await tx.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
      if (!result.count) throw new NotFoundException("Позиция корзины не найдена");
    });
  }

  async checkout(userId: number, dto: CheckoutDto) {
    const start = this.asFutureDate(dto.desiredStartAt, "Желаемое время должно быть в будущем");
    const end = dto.desiredEndAt ? this.asFutureDate(dto.desiredEndAt, "Время окончания должно быть в будущем") : null;
    if (end && end <= start) throw new BadRequestException("Окончание должно быть позже начала");
    const order = await this.prisma.$transaction(async (tx) => {
      await this.lockCart(tx, userId);
      const cart = await tx.cart.findUnique({ where: { userId }, include: { items: { include: { serviceElement: true } } } });
      if (!cart?.items.length) throw new BadRequestException("Корзина пуста");
      const serviceTypeIds = [...new Set(cart.items.map((item) => item.serviceElement.type))];
      const types = await tx.serviceType.findMany({ where: { id: { in: serviceTypeIds } } });
      if (types.length !== serviceTypeIds.length) throw new ConflictException("Один из сервисов больше не существует");
      const typeById = new Map(types.map((type) => [type.id, type]));
      for (const cartItem of cart.items) {
        const type = typeById.get(cartItem.serviceElement.type)!;
        if (cartItem.serviceElement.isArchive || !cartItem.serviceElement.preorderAvailable || !type.acceptsPreorders) {
          throw new ConflictException(`Позиция «${cartItem.serviceElement.name}» сейчас недоступна для предзаказа`);
        }
      }
      this.assertCartCompatibility(types, serviceTypeIds.length);
      const durationBooking = types.some((type) => type.bookingMode === BookingMode.duration);
      if (durationBooking && (!end || types.length > 1)) {
        throw new BadRequestException("Длительное бронирование оформляется отдельным заказом с датой окончания");
      }
      if (!durationBooking && end) throw new BadRequestException("Дата окончания доступна только для длительного бронирования");
      if (durationBooking) await this.assertBookingCapacity(tx, types[0], start, end!);
      const scheduledEnd = end ?? null;
      const completionDueAt = new Date((scheduledEnd ?? start).getTime() + 60 * 60 * 1000);
      const preorder = await tx.preorder.create({
        data: {
          userId, desiredStartAt: start, desiredEndAt: end, scheduledStartAt: start, scheduledEndAt: scheduledEnd,
          completionDueAt, customerNote: dto.customerNote,
          items: { create: cart.items.map(({ serviceElement, quantity }) => ({
            serviceElementId: serviceElement.id, serviceTypeId: serviceElement.type, name: serviceElement.name, price: serviceElement.price, quantity,
          })) },
        }, include: orderInclude,
      });
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return preorder;
    });
    return this.present(order);
  }

  async myOrders(userId: number) {
    await this.completeOverdueOrders();
    return Promise.all((await this.prisma.preorder.findMany({ where: { userId }, include: orderInclude, orderBy: { createdAt: "desc" } })).map((order) => this.present(order)));
  }

  async adminOrders(includeArchived: boolean) {
    await this.completeOverdueOrders();
    return Promise.all((await this.prisma.preorder.findMany({ where: includeArchived ? {} : { isArchived: false }, include: orderInclude, orderBy: { createdAt: "desc" } })).map((order) => this.present(order)));
  }

  async proposeSchedule(id: number, dto: ProposeScheduleDto) {
    const start = this.asFutureDate(dto.scheduledStartAt, "Новое время должно быть в будущем");
    const end = dto.scheduledEndAt ? this.asFutureDate(dto.scheduledEndAt, "Новое время окончания должно быть в будущем") : null;
    return this.prisma.$transaction(async (tx) => {
      const order = await this.requireOrder(tx, id);
      this.assertMutable(order.status);
      const duration = order.items.some((item) => item.serviceType.bookingMode === BookingMode.duration);
      if (duration !== Boolean(end) || (end && end <= start)) throw new BadRequestException(duration ? "Для длительного бронирования укажите корректное окончание" : "Для обычного заказа окончание не указывается");
      if (duration) await this.assertBookingCapacity(tx, order.items[0].serviceType, start, end!, id);
      return this.present(await tx.preorder.update({ where: { id }, data: { status: PreorderStatus.needs_confirmation, proposedStartAt: start, proposedEndAt: end, proposalNote: dto.note }, include: orderInclude }));
    });
  }

  async acceptProposal(userId: number, id: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.requireOrder(tx, id);
      if (order.userId !== userId) throw new ForbiddenException();
      if (order.status !== PreorderStatus.needs_confirmation || !order.proposedStartAt) throw new ConflictException("Нет предложения, ожидающего подтверждения");
      const duration = order.items.some((item) => item.serviceType.bookingMode === BookingMode.duration);
      if (duration) await this.assertBookingCapacity(tx, order.items[0].serviceType, order.proposedStartAt, order.proposedEndAt!, id);
      const completionDueAt = new Date((order.proposedEndAt ?? order.proposedStartAt).getTime() + 60 * 60 * 1000);
      return this.present(await tx.preorder.update({ where: { id }, data: { status: PreorderStatus.accepted, scheduledStartAt: order.proposedStartAt, scheduledEndAt: order.proposedEndAt, completionDueAt, proposedStartAt: null, proposedEndAt: null, proposalNote: null }, include: orderInclude }));
    });
  }

  async rejectProposal(userId: number, id: number) {
    const order = await this.requireOwnedOrder(userId, id);
    if (order.status !== PreorderStatus.needs_confirmation) throw new ConflictException("Заказ не ожидает подтверждения");
    return this.present(await this.prisma.preorder.update({ where: { id }, data: { status: PreorderStatus.cancelled }, include: orderInclude }));
  }

  async postpone(userId: number, id: number, dto: PostponeOrderDto) {
    const order = await this.requireOwnedOrder(userId, id);
    if (order.postponementUsed || terminalStatuses.has(order.status) || order.status === PreorderStatus.needs_confirmation || order.status === PreorderStatus.pending) throw new ConflictException("Этот заказ нельзя отложить");
    const until = this.asFutureDate(dto.until, "Новое время должно быть в будущем");
    if (until <= order.scheduledStartAt) throw new BadRequestException("Время отложения должно быть позже назначенного времени");
    return this.present(await this.prisma.preorder.update({ where: { id }, data: { postponementUsed: true, postponedUntil: until, completionDueAt: until }, include: orderInclude }));
  }

  async setStatus(id: number, dto: SetOrderStatusDto) {
    const order = await this.requireOrder(this.prisma, id);
    this.assertMutable(order.status);
    if (dto.status === PreorderStatus.pending || dto.status === PreorderStatus.needs_confirmation) throw new BadRequestException("Этот статус выставляется только через оформление или согласование");
    const allowed: Record<PreorderStatus, PreorderStatus[]> = {
      pending: [PreorderStatus.accepted, PreorderStatus.rejected, PreorderStatus.cancelled],
      needs_confirmation: [], accepted: [PreorderStatus.in_progress, PreorderStatus.ready, PreorderStatus.completed, PreorderStatus.cancelled],
      in_progress: [PreorderStatus.ready, PreorderStatus.completed, PreorderStatus.cancelled], ready: [PreorderStatus.completed, PreorderStatus.cancelled],
      completed: [], rejected: [], cancelled: [],
    };
    if (!allowed[order.status].includes(dto.status)) throw new ConflictException("Недопустимый переход статуса");
    return this.present(await this.prisma.preorder.update({ where: { id }, data: { status: dto.status, adminNote: dto.adminNote }, include: orderInclude }));
  }

  async archive(id: number, isArchived: boolean) {
    const order = await this.requireOrder(this.prisma, id);
    if (isArchived && !terminalStatuses.has(order.status)) throw new ConflictException("Архивировать можно только завершённый или отменённый заказ");
    return this.present(await this.prisma.preorder.update({ where: { id }, data: { isArchived }, include: orderInclude }));
  }

  async confirmCompletion(userId: number, id: number) {
    const order = await this.requireOwnedOrder(userId, id);
    if (order.status !== PreorderStatus.accepted && order.status !== PreorderStatus.in_progress && order.status !== PreorderStatus.ready) throw new ConflictException("Этот заказ нельзя подтвердить");
    return this.present(await this.prisma.preorder.update({ where: { id }, data: { status: PreorderStatus.completed }, include: orderInclude }));
  }

  async completeOverdueOrders() {
    await this.prisma.preorder.updateMany({ where: { status: { in: [PreorderStatus.accepted, PreorderStatus.in_progress, PreorderStatus.ready] }, completionDueAt: { lte: new Date() } }, data: { status: PreorderStatus.completed } });
  }

  private async lockCart(tx: Prisma.TransactionClient, userId: number) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(${cartLockNamespace}, ${userId})`; }
  private async requireCart(db: DbClient, userId: number) { const cart = await db.cart.findUnique({ where: { userId } }); if (!cart) throw new NotFoundException("Корзина пуста"); return cart; }
  private async requireOrder(db: DbClient, id: number) { const order = await db.preorder.findUnique({ where: { id }, include: orderInclude }); if (!order) throw new NotFoundException("Заказ не найден"); return order; }
  private assertCartCompatibility(types: { id: number; acceptsPreorders: boolean; allowMixedCart: boolean; bookingMode: BookingMode }[], expectedCount: number) {
    if (types.length !== expectedCount) throw new ConflictException("Один из сервисов больше не существует");
    if (types.some((type) => !type.acceptsPreorders)) throw new ConflictException("Один из сервисов сейчас не принимает предзаказы");
    if (types.length > 1 && (types.some((type) => !type.allowMixedCart) || types.some((type) => type.bookingMode === BookingMode.duration))) throw new ConflictException("Этот сервис можно оформить только отдельным заказом");
  }
  private async assertBookingCapacity(tx: Prisma.TransactionClient, serviceType: { id: number; bookingCapacity: number }, start: Date, end: Date, excludeOrderId?: number) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${bookingLockNamespace}, ${serviceType.id})`;
    const rows = await tx.$queryRaw<{ reserved: number }[]>`
      SELECT count(DISTINCT preorder."id")::int AS reserved
      FROM "Preorder" AS preorder
      INNER JOIN "PreorderItem" AS item ON item."preorderId" = preorder."id"
      WHERE item."serviceTypeId" = ${serviceType.id}
        AND preorder."status" IN ('pending', 'needs_confirmation', 'accepted', 'in_progress', 'ready')
        AND COALESCE(preorder."proposedStartAt", preorder."scheduledStartAt") < ${end}
        AND COALESCE(preorder."proposedEndAt", preorder."scheduledEndAt") > ${start}
        AND (${excludeOrderId ?? null}::int IS NULL OR preorder."id" <> ${excludeOrderId ?? null}::int)
    `;
    if (Number(rows[0]?.reserved ?? 0) >= serviceType.bookingCapacity) throw new ConflictException("На выбранный период свободных мест больше нет");
  }
  private async requireOwnedOrder(userId: number, id: number) { const order = await this.requireOrder(this.prisma, id); if (order.userId !== userId) throw new ForbiddenException(); return order; }
  private assertMutable(status: PreorderStatus) { if (terminalStatuses.has(status)) throw new ConflictException("Заказ уже завершён или отменён"); }
  private asFutureDate(value: string, message: string) { const date = new Date(value); if (Number.isNaN(date.getTime()) || date <= new Date()) throw new BadRequestException(message); return date; }
  private present<T extends { items: { price: number; quantity: number }[] }>(order: T) { return { ...order, total: order.items.reduce((sum, item) => sum + item.price * item.quantity, 0) }; }
}
