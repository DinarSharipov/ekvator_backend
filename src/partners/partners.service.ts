import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreatePartnerDto, UpdatePartnerDto } from "./dto/partner.dto";

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  list() { return this.prisma.partner.findMany({ orderBy: { id: "asc" } }); }

  async get(id: number) {
    const partner = await this.prisma.partner.findUnique({ where: { id } });
    if (!partner) throw new NotFoundException("Partner not found");
    return partner;
  }

  create(dto: CreatePartnerDto) { return this.prisma.partner.create({ data: dto }); }

  async update(id: number, dto: UpdatePartnerDto) {
    try { return await this.prisma.partner.update({ where: { id }, data: dto }); }
    catch (error) { this.rethrow(error); }
  }

  async delete(id: number) {
    try { await this.prisma.partner.delete({ where: { id } }); }
    catch (error) { this.rethrow(error); }
  }

  private rethrow(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025")
      throw new NotFoundException("Partner not found");
    throw error;
  }
}
