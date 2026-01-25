import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateServiceElementDto } from "./dto/create.service-element.dto";
import { UpdateServiceElementDto } from "./dto/update.service-element.dto";

@Injectable()
export class ServiceElementService {
  constructor(private readonly prisma: PrismaService) {}

  create(createServiceDTO: CreateServiceElementDto) {
    return this.prisma.serviceElement.create({
      data: createServiceDTO,
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
      data: updateServiceElementDto,
    });
  }

  remove(id: number) {
    return this.prisma.serviceElement.delete({
      where: { id },
    });
  }
}

