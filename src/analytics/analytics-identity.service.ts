import { Injectable } from "@nestjs/common";
import { AuthTokensService } from "../auth/auth-tokens.service";
import { PrismaService } from "../prisma/prisma.service";

/** Resolves a valid bearer token when present, but never makes public tracking fail. */
@Injectable()
export class AnalyticsIdentityService {
  constructor(private readonly tokens: AuthTokensService, private readonly prisma: PrismaService) {}

  async userId(authorization?: string): Promise<number | undefined> {
    const [type, token] = authorization?.split(" ") ?? [];
    if (type !== "Bearer" || !token) return undefined;
    try {
      const payload = await this.tokens.verify(token);
      if (!Number.isInteger(payload.sub) || payload.sub < 1) return undefined;
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true } });
      return user?.id;
    } catch {
      return undefined;
    }
  }
}
