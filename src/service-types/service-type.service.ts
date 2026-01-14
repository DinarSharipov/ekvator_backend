import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateServiceTypeDto } from "./dto/create.service-type.dto";
import { UpdateServiceTypeDto } from "./dto/update.service-type.dto";

@Injectable()
export class ServiceTypeService {
  constructor(private readonly prisma: PrismaService) {}

  create(createServiceDTO: CreateServiceTypeDto) {
    return this.prisma.serviceType.create({
      data: createServiceDTO,
    });
  }

  findAll() {
    return this.prisma.serviceType.findMany({
      orderBy: {
        name: "desc",
      },
    });
  }

  findOne(id: number) {
    return this.prisma.serviceType.findUnique({
      where: { id },
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

