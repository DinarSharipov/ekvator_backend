import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDTO } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: createUserDto,
    });
  }

  update(id: number, updateUserDTO: UpdateUserDTO) {
    return this.prisma.serviceType.update({
      where: { id },
      data: updateUserDTO,
    });
  }

  async findAll() {
    return this.prisma.user.findMany({
      orderBy: {
        name: "desc",
      },
    });
  }

  async findByLogin(login: string) {
    const user = await this.prisma.user.findFirst({
      where: { login },
    });
    return user;
  }

  async findOne(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async delete(id: number) {
    await this.prisma.user.delete({
      where: { id },
    });
  }
}

