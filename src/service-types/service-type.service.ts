import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { BookingMode, ServiceKind } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import { CreateServiceTypeDto } from "./dto/create.service-type.dto";
import { UpdateServiceTypeDto } from "./dto/update.service-type.dto";

@Injectable()
export class ServiceTypeService {
  constructor(private readonly prisma: PrismaService) {}

  create(createServiceDTO: CreateServiceTypeDto) {
    const kind = createServiceDTO.kind ?? (createServiceDTO.bookingMode === BookingMode.duration ? ServiceKind.services : ServiceKind.goods);
    this.assertBookingMode(kind, createServiceDTO.bookingMode ?? BookingMode.appointment);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "ServiceType" IN SHARE ROW EXCLUSIVE MODE`;
      const last = await tx.serviceType.aggregate({ _max: { sortOrder: true } });
      return tx.serviceType.create({ data: { ...createServiceDTO, kind, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    });
  }

  findAll() {
    return this.prisma.serviceType.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        kind: true,
        description: true,
        name: true,
        phone: true,
        secondPhone: true,
        sortOrder: true,
        photo: true,
        showInMain: true,
        showType: true,
        acceptsPreorders: true,
        allowMixedCart: true,
        bookingMode: true,
        bookingCapacity: true,
        prepaymentEnabled: true,
      },
    });
  }

  findOne(id: number) {
    return this.prisma.serviceType.findUnique({
      where: { id },
    });
  }

  reorder(ids: number[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "ServiceType" IN SHARE ROW EXCLUSIVE MODE`;
      const current = await tx.serviceType.findMany({ select: { id: true } });
      const existing = new Set(current.map((service) => service.id));
      if (current.length !== ids.length || new Set(ids).size !== ids.length || ids.some((id) => !existing.has(id))) {
        throw new ConflictException("Список сервисов изменился. Обновите страницу и повторите действие.");
      }
      for (const [sortOrder, id] of ids.entries()) await tx.serviceType.update({ where: { id }, data: { sortOrder } });
    });
  }

  update(id: number, updateServiceTypeDto: UpdateServiceTypeDto) {
    return this.prisma.$transaction(async (tx) => {
      // Serialize settings edits so kind and booking mode are validated together.
      await tx.$queryRaw`SELECT "id" FROM "ServiceType" WHERE "id" = ${id} FOR UPDATE`;
      const current = await tx.serviceType.findUnique({ where: { id } });
      if (!current) throw new NotFoundException("Сервис не найден");
      const kind = updateServiceTypeDto.kind ?? (updateServiceTypeDto.bookingMode === BookingMode.duration ? ServiceKind.services : current.kind);
      this.assertBookingMode(kind, updateServiceTypeDto.bookingMode ?? current.bookingMode);
      return tx.serviceType.update({ where: { id }, data: { ...updateServiceTypeDto, kind } });
    });
  }

  private assertBookingMode(kind: ServiceKind, mode: BookingMode) {
    if (kind === ServiceKind.goods && mode !== BookingMode.appointment) {
      throw new BadRequestException("Товары можно заказать только к выбранному времени, без периода");
    }
  }

  remove(id: number) {
    return this.prisma.serviceType.delete({
      where: { id },
    });
  }
}

