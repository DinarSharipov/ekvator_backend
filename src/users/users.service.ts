import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { UserRole } from "../generated/prisma/enums";
import { PasswordService } from "../auth/password.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDTO } from "./dto/update-user.dto";
import { RegisterDto } from "../auth/dto/register.dto";
import { phoneLookupKey } from "./phone";

export const publicUserSelect = {
  id: true,
  name: true,
  login: true,
  surname: true,
  phone: true,
  email: true,
  telegram: true,
  role: true,
  userRole: true,
  phoneVerifiedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private passwords: PasswordService,
  ) {}

  async create(dto: CreateUserDto) {
    return this.createAccount({
      ...dto,
      userRole: dto.userRole ?? UserRole.admin,
    });
  }

  async register(dto: RegisterDto) {
    // Never spread public input into permission or verification fields.
    return this.createAccount({
      login: dto.login,
      phone: dto.phone,
      password: dto.password,
      name: dto.name ?? dto.login,
      role: "user",
      userRole: UserRole.user,
    });
  }

  private async createAccount(data: Prisma.UserCreateInput) {
    const password = await this.passwords.hash(data.password);
    try {
      return await this.prisma.user.create({
        data: {
          ...data,
          phoneNormalized: phoneLookupKey(data.phone),
          password,
        },
        select: publicUserSelect,
      });
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async update(id: number, dto: UpdateUserDTO) {
    const data = {
      ...dto,
      ...(dto.password !== undefined
        ? { password: await this.passwords.hash(dto.password) }
        : {}),
      ...(dto.phone !== undefined
        ? {
            phoneNormalized: phoneLookupKey(dto.phone),
            phoneVerifiedAt: null,
          }
        : {}),
    };
    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: publicUserSelect,
      });
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  findAll() {
    return this.prisma.user.findMany({
      orderBy: { name: "desc" },
      select: publicUserSelect,
    });
  }

  findByLogin(login: string) {
    return this.prisma.user.findUnique({ where: { login } });
  }

  async findForSignIn(identifier: string, phoneOnly = false) {
    if (!phoneOnly) {
      const byLogin = await this.findByLogin(identifier);
      if (byLogin) return byLogin;
    }
    const phone = phoneLookupKey(identifier);
    if (!phone) return null;
    return this.prisma.user.findUnique({ where: { phoneNormalized: phone } });
  }

  findOne(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  async delete(id: number) {
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  private rethrowWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        throw new ConflictException("Логин или телефон уже используется");
      if (error.code === "P2025")
        throw new NotFoundException("Пользователь не найден");
    }
    throw error;
  }
}
