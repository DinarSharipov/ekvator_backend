import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Query, UseGuards, ValidationPipe } from "@nestjs/common";
import { ApiAcceptedResponse, ApiBearerAuth, ApiExtraModels, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { AdminGuard } from "../auth/admin.guard";
import { AuthGuard } from "../auth/auth.guard";
import { AnalyticsIdentityService } from "./analytics-identity.service";
import { AnalyticsService } from "./analytics.service";
import { TrackAnalyticsDto } from "./dto/analytics-event.dto";
import { AnalyticsOverviewDto } from "./dto/analytics-overview.dto";
import { AnalyticsAcceptedResponseDto, AnalyticsOverviewResponseDto, ApiErrorDto } from "../openapi/response.dto";

@ApiTags("analytics")
@Controller("analytics")
@ApiExtraModels(AnalyticsAcceptedResponseDto, ApiErrorDto)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService, private readonly identity: AnalyticsIdentityService) {}

  @Post("events")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Записать события поведения", description: "Публичный пакетный endpoint для фронтенда. Не передавайте query-параметры, тексты, телефоны, IP или иные персональные данные; target — стабильный технический ключ действия." })
  @ApiAcceptedResponse({ description: "События приняты; повторная отправка eventId безопасна", type: AnalyticsAcceptedResponseDto })
  @ApiResponse({ status: 400, description: "Некорректный пакет либо недопустимое время события", type: ApiErrorDto })
  track(@Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: TrackAnalyticsDto, @Headers("authorization") authorization?: string) {
    return this.identity.userId(authorization).then((userId) => this.analytics.track(dto.visitorId, dto.events, userId));
  }
}

@ApiTags("analytics")
@ApiBearerAuth()
@Controller("admin/analytics")
@UseGuards(AuthGuard, AdminGuard)
@ApiExtraModels(AnalyticsOverviewResponseDto, ApiErrorDto)
@ApiResponse({ status: 400, description: "Некорректный период", type: ApiErrorDto })
@ApiUnauthorizedResponse({ description: "Требуется Bearer JWT", type: ApiErrorDto })
@ApiForbiddenResponse({ description: "Требуется роль администратора", type: ApiErrorDto })
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("overview")
  @ApiOperation({ summary: "Получить сводку активности сайта", description: "Только для администратора: уникальные браузерные посетители, уникальные авторизованные пользователи, просмотры, клики и популярные сервисы/элементы за UTC-период [from, to). По умолчанию — текущий UTC-день." })
  @ApiOkResponse({ description: "Сводка за запрошенный UTC-период", type: AnalyticsOverviewResponseDto })
  overview(@Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) query: AnalyticsOverviewDto) {
    return this.analytics.overview(query.from, query.to);
  }
}
