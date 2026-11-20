import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

import { AccessUser, effectivePrivileges } from "./privileges";

@Injectable()
export class SmsVerificationService {
  get enabled(): boolean {
    return process.env.SMS_VERIFICATION_ENABLED === "true";
  }

  assertRegistrationAvailable(): void {
    if (this.enabled) {
      // Fail closed until a real SMS provider and one-time challenge verification are connected.
      throw new ServiceUnavailableException(
        "Подтверждение по SMS ещё не подключено",
      );
    }
  }

  assertCanSignIn(
    user: AccessUser & {
      phoneVerifiedAt: Date | null;
    },
  ): void {
    if (
      this.enabled &&
      effectivePrivileges(user).length === 0 &&
      !user.phoneVerifiedAt
    ) {
      throw new ForbiddenException("Необходимо подтвердить номер телефона");
    }
  }
}
