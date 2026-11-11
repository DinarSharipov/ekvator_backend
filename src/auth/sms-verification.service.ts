import {
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";

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

  assertCanSignIn(user: {
    userRole: string;
    phoneVerifiedAt: Date | null;
  }): void {
    if (this.enabled && user.userRole === "user" && !user.phoneVerifiedAt) {
      throw new ForbiddenException("Необходимо подтвердить номер телефона");
    }
  }
}
