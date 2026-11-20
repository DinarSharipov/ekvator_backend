import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { SiteContactsDto } from "./dto/site-contacts.dto";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async contacts() {
    const contacts = await this.prisma.siteContacts.findUnique({ where: { id: 1 } });
    if (!contacts) throw new NotFoundException("Контакты комплекса ещё не настроены");
    const { id, ...result } = contacts;
    return result;
  }

  async replaceContacts(dto: SiteContactsDto) {
    const data = { ...dto, email: dto.email ?? null, mapUrl: dto.mapUrl ?? null };
    const { id, ...result } = await this.prisma.siteContacts.upsert({ where: { id: 1 }, create: { id: 1, ...data }, update: data });
    return result;
  }
}
