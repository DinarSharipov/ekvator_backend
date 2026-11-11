import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthTokensService } from "./auth-tokens.service";
import { UsersService } from "../users/users.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { PasswordService } from "./password.service";
import { SmsVerificationService } from "./sms-verification.service";

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private tokens: AuthTokensService,
    private passwords: PasswordService,
    private smsVerification: SmsVerificationService,
  ) {}

  async register(dto: RegisterDto) {
    this.smsVerification.assertRegistrationAvailable();
    const user = await this.usersService.register(dto);
    return { ...(await this.issueToken(user)), user };
  }

  async signIn(dto: LoginDto) {
    if (Boolean(dto.login) === Boolean(dto.phone)) {
      throw new BadRequestException("Укажите либо логин, либо телефон");
    }
    const user = await this.usersService.findForSignIn(
      dto.login ?? dto.phone,
      !!dto.phone,
    );
    // Derive a key for missing accounts too, instead of returning immediately.
    const valid = await this.passwords.verify(
      dto.password,
      user?.password ?? "invalid-account-password",
    );
    if (!user || !valid)
      throw new UnauthorizedException("Неверный логин, телефон или пароль");
    this.smsVerification.assertCanSignIn(user);
    const {
      password: _password,
      phoneNormalized: _phoneNormalized,
      ...publicUser
    } = user;
    return { ...(await this.issueToken(user)), user: publicUser };
  }

  private async issueToken(user: {
    id: number;
    login: string;
    userRole: string;
  }) {
    return {
      access_token: await this.tokens.sign({
        sub: user.id,
        login: user.login,
        userRole: user.userRole,
      }),
    };
  }
}
