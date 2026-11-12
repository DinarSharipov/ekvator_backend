import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateServiceTypeDto } from "./dto/create.service-type.dto";
import { UpdateServiceTypeDto } from "./dto/update.service-type.dto";

@Injectable()
export class ServiceTypeService {
  constructor(private readonly prisma: PrismaService) {}

  create(createServiceDTO: CreateServiceTypeDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "ServiceType" IN SHARE ROW EXCLUSIVE MODE`;
      const last = await tx.serviceType.aggregate({ _max: { sortOrder: true } });
      return tx.serviceType.create({ data: { ...createServiceDTO, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    });
  }

  findAll() {
    return this.prisma.serviceType.findMany({
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
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
    return this.prisma.serviceType.update({
      where: { id },
      data: updateServiceTypeDto,
    });
  }

  remove(id: number) {
    return this.prisma.serviceType.delete({
      where: { id },
    });
  }
}

