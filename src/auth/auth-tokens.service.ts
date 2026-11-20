import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHmac } from "node:crypto";
import { env } from "prisma/config";

interface AuthPayload {
  sub: number;
  login: string;
}

@Injectable()
export class AuthTokensService {
  constructor(private jwt: JwtService) {}

  private get userSecret(): string {
    return createHmac("sha256", env("JWT"))
      .update("ekvator:ordinary-user-auth:v1")
      .digest("hex");
  }

  sign(payload: AuthPayload): Promise<string> {
    // Identity only; current privileges are loaded from the database.
    // Keep the separated signing key and accept existing JWTs during migration.
    return this.jwt.signAsync(
      { sub: payload.sub, login: payload.login },
      { secret: this.userSecret },
    );
  }

  async verify(token: string): Promise<AuthPayload> {
    try {
      return await this.jwt.verifyAsync<AuthPayload>(token);
    } catch {
      return this.jwt.verifyAsync<AuthPayload>(token, {
        secret: this.userSecret,
      });
    }
  }
}
