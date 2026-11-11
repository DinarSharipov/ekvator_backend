import { Injectable } from "@nestjs/common";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const deriveKey = promisify(scrypt);
const PREFIX = "scrypt$";

@Injectable()
export class PasswordService {
  private isHashed(password: string): boolean {
    return password.startsWith(PREFIX);
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");
    const key = (await deriveKey(password, salt, 64)) as Buffer;
    return `${PREFIX}${salt}$${key.toString("hex")}`;
  }

  async verify(password: string, stored: string): Promise<boolean> {
    if (!this.isHashed(stored)) {
      // Preserve legacy account passwords during the rollback compatibility window.
      const salt = "legacy-password-comparison";
      const [actual, expected] = await Promise.all([
        deriveKey(password, salt, 64),
        deriveKey(stored, salt, 64),
      ]);
      return timingSafeEqual(actual as Buffer, expected as Buffer);
    }
    const [, salt, hex] = stored.split("$");
    if (!/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hex))
      return false;
    const actual = (await deriveKey(password, salt, 64)) as Buffer;
    return timingSafeEqual(actual, Buffer.from(hex, "hex"));
  }
}
