import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { SmsVerificationService } from "./sms-verification.service";
import { UsersService } from "../users/users.service";

@ApiTags("auth")
@Controller("auth")
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class AuthController {
  constructor(
    private authService: AuthService,
    private smsVerification: SmsVerificationService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post("login")
  @ApiOperation({ summary: "Вход по логину или телефону и паролю" })
  @ApiResponse({ status: 200, description: "JWT и профиль пользователя" })
  signIn(@Body() dto: LoginDto) {
    return this.authService.signIn(dto);
  }

  @Post("register")
  @ApiOperation({ summary: "Зарегистрировать обычного пользователя" })
  @ApiResponse({
    status: 201,
    description: "Пользователь создан, возвращены JWT и профиль",
  })
  @ApiResponse({
    status: 409,
    description: "Логин или телефон уже используется",
  })
  @ApiResponse({
    status: 503,
    description: "SMS-проверка включена, но провайдер ещё не подключён",
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Получить собственный профиль и роль доступа" })
  me(@Req() request: { user: Awaited<ReturnType<UsersService["findOne"]>> }) {
    return request.user;
  }

  @Get("features")
  @ApiOperation({ summary: "Получить публичные настройки авторизации" })
  features() {
    return { smsVerificationEnabled: this.smsVerification.enabled };
  }
}
