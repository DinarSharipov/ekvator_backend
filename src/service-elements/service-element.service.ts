import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { BulkPreorderAvailabilityDto } from "./dto/bulk-preorder-availability.dto";
import { PrismaService } from "../prisma/prisma.service";
import { CreateServiceElementDto } from "./dto/create.service-element.dto";
import { UpdateServiceElementDto } from "./dto/update.service-element.dto";

@Injectable()
export class ServiceElementService {
  constructor(private readonly prisma: PrismaService) {}

  async setPreorderAvailability(dto: BulkPreorderAvailabilityDto, serviceTypeIds?: number[]) {
    await this.prisma.$transaction(async (tx) => {
      // Keep service ownership stable until the authorization check and update finish.
      await tx.$queryRaw`SELECT "id" FROM "ServiceElement" WHERE "id" IN (${Prisma.join(dto.ids)}) ORDER BY "id" FOR UPDATE`;
      const items = await tx.serviceElement.findMany({ where: { id: { in: dto.ids } }, select: { id: true, type: true } });
      if (items.length !== dto.ids.length) throw new NotFoundException("Один или несколько товаров или услуг не найдены");
      if (serviceTypeIds !== undefined) {
        const allowed = new Set(serviceTypeIds);
        if (items.some((item) => !allowed.has(item.type))) throw new ForbiddenException("Нет доступа к одному или нескольким сервисам");
      }
      await tx.serviceElement.updateMany({ where: { id: { in: dto.ids } }, data: { preorderAvailable: dto.preorderAvailable } });
    });
  }

  create(createServiceDTO: CreateServiceElementDto) {
    return this.prisma.serviceElement.create({
      data: {
        ...createServiceDTO,
        price: parseFloat(createServiceDTO.price),
      },
    });
  }

  findAll() {
    return this.prisma.serviceElement.findMany({
      orderBy: {
        name: "desc",
      },
      select: {
        id: true,
        description: true,
        isArchive: true,
        name: true,
        price: true,
        type: true,
        createdDate: true,
        preorderAvailable: true,
      },
    });
  }

  findAllByServiceId(id: number) {
    return this.prisma.serviceElement.findMany({
      orderBy: {
        name: "desc",
      },
      where: { type: id },
    });
  }

  findOne(id: number) {
    return this.prisma.serviceElement.findUnique({
      where: { id },
    });
  }

  update(id: number, updateServiceElementDto: UpdateServiceElementDto) {
    return this.prisma.serviceElement.update({
      where: { id },
      data: {
        ...updateServiceElementDto,
        price: parseFloat(updateServiceElementDto.price),
      },
    });
  }

  remove(id: number) {
    return this.prisma.serviceElement.delete({
      where: { id },
    });
  }
}

