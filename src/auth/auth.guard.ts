import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthTokensService } from "./auth-tokens.service";
import { Request } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { publicUserSelect } from "../users/users.service";
import { SmsVerificationService } from "./sms-verification.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private tokens: AuthTokensService,
    private prisma: PrismaService,
    private smsVerification: SmsVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const [type, token] =
      (request as Request).headers.authorization?.split(" ") ?? [];
    if (type !== "Bearer" || !token) throw new UnauthorizedException();
    let payload: { sub: number };
    try {
      payload = await this.tokens.verify(token);
      if (!Number.isInteger(payload.sub) || payload.sub < 1)
        throw new Error("Invalid subject");
    } catch {
      throw new UnauthorizedException();
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: publicUserSelect,
    });
    if (!user) throw new UnauthorizedException();
    this.smsVerification.assertCanSignIn(user);
    request.user = user;
    return true;
  }
}
