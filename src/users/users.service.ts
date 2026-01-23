import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    return this.prisma.user.create({
      data: createUserDto,
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

