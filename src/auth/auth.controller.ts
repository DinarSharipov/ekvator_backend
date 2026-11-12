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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { SmsVerificationService } from "./sms-verification.service";
import { UsersService } from "../users/users.service";
import { ApiErrorDto, AuthFeaturesResponseDto, AuthResponseDto, UserResponseDto } from "../openapi/response.dto";

@ApiTags("auth")
@Controller("auth")
@ApiExtraModels(ApiErrorDto, AuthResponseDto, UserResponseDto, AuthFeaturesResponseDto)
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
  @ApiOperation({ summary: "Вход по логину или телефону и паролю", description: "Принимает логин либо нормализованный номер телефона и пароль; возвращает JWT." })
  @ApiOkResponse({ description: "JWT и профиль пользователя", type: AuthResponseDto })
  @ApiResponse({ status: 400, description: "Указаны одновременно либо не указаны логин и телефон", type: ApiErrorDto })
  @ApiUnauthorizedResponse({ description: "Неверные учётные данные", type: ApiErrorDto })
  signIn(@Body() dto: LoginDto) {
    return this.authService.signIn(dto);
  }

  @Post("register")
  @ApiOperation({ summary: "Зарегистрировать обычного пользователя", description: "Создаёт пользователя с ролью user. SMS-подтверждение управляется feature flag." })
  @ApiCreatedResponse({ description: "Пользователь создан, возвращены JWT и профиль", type: AuthResponseDto })
  @ApiResponse({ status: 400, description: "Некорректное тело регистрации", type: ApiErrorDto })
  @ApiConflictResponse({ description: "Логин или телефон уже используется", type: ApiErrorDto })
  @ApiResponse({
    status: 503,
    description: "SMS-проверка включена, но провайдер ещё не подключён", type: ApiErrorDto,
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Получить собственный профиль и роль доступа", description: "Возвращает актуальные данные пользователя из БД, включая действующие назначения сервисов." })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiUnauthorizedResponse({ description: "Требуется Bearer JWT", type: ApiErrorDto })
  me(@Req() request: { user: Awaited<ReturnType<UsersService["findOne"]>> }) {
    return request.user;
  }

  @Get("features")
  @ApiOperation({ summary: "Получить публичные настройки авторизации", description: "Возвращает флаги, по которым клиент включает сценарии авторизации." })
  @ApiOkResponse({ description: "Публичные feature flags авторизации", type: AuthFeaturesResponseDto })
  features() {
    return { smsVerificationEnabled: this.smsVerification.enabled };
  }
}
