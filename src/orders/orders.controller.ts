import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseBoolPipe, ParseIntPipe, Patch, Post, Query, Request, UseGuards, ValidationPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedUser, ServiceAccessService } from "../auth/service-access.service";
import { UserRole } from "../generated/prisma/enums";
import { AddCartItemDto, UpdateCartItemDto } from "./dto/cart.dto";
import { CheckoutDto } from "./dto/checkout.dto";
import { ArchiveOrderDto, PostponeOrderDto, ProposeScheduleDto, SetOrderStatusDto } from "./dto/order-actions.dto";
import { CalendarEventsQueryDto, UserFilterOptionsQueryDto } from "./dto/calendar-query.dto";
import { OrdersService } from "./orders.service";

@ApiTags("cart-and-preorders")
@ApiBearerAuth()
@Controller()
@UseGuards(AuthGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly serviceAccess: ServiceAccessService) {}
  @Get("cart") @ApiOperation({ summary: "Получить корзину", description: "Возвращает текущую корзину авторизованного пользователя вместе с товарами и услугами." }) getCart(@Request() req: { user: { id: number } }) { return this.orders.getCart(req.user.id); }
  @Post("cart/items") @ApiOperation({ summary: "Добавить позицию в корзину", description: "Добавляет или заменяет количество доступной для предзаказа позиции. Совместимость сервисов проверяется на сервере." }) addCartItem(@Request() req: { user: { id: number } }, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: AddCartItemDto) { return this.orders.addCartItem(req.user.id, dto); }
  @Patch("cart/items/:id") @ApiOperation({ summary: "Изменить количество позиции в корзине", description: "Изменяет количество только позиции, принадлежащей корзине текущего пользователя." }) updateCartItem(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: UpdateCartItemDto) { return this.orders.updateCartItem(req.user.id, id, dto); }
  @Delete("cart/items/:id") @HttpCode(HttpStatus.NO_CONTENT) @ApiOperation({ summary: "Удалить позицию из корзины", description: "Удаляет указанную позицию из корзины текущего пользователя." }) removeCartItem(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number) { return this.orders.removeCartItem(req.user.id, id); }
  @Post("orders") @ApiOperation({ summary: "Оформить предзаказ", description: "Проверяет доступность позиций, создаёт снимок цен и очищает корзину атомарно." }) checkout(@Request() req: { user: { id: number } }, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: CheckoutDto) { return this.orders.checkout(req.user.id, dto); }
  @Get("orders/me") @ApiOperation({ summary: "Получить мои предзаказы", description: "Возвращает историю и текущие статусы заказов авторизованного пользователя." }) myOrders(@Request() req: { user: { id: number } }) { return this.orders.myOrders(req.user.id); }
  @Post("orders/:id/accept-proposal") @ApiOperation({ summary: "Принять предложенное время", description: "Подтверждает изменённые администратором дату и время заказа." }) accept(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number) { return this.orders.acceptProposal(req.user.id, id); }
  @Post("orders/:id/reject-proposal") @ApiOperation({ summary: "Отклонить предложенное время", description: "Отменяет заказ, если клиент не согласен с предложенным временем." }) reject(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number) { return this.orders.rejectProposal(req.user.id, id); }
  @Post("orders/:id/confirm-completion") @ApiOperation({ summary: "Подтвердить получение заказа", description: "Клиент подтверждает оказание услуги или получение товара." }) confirmCompletion(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number) { return this.orders.confirmCompletion(req.user.id, id); }
  @Post("orders/:id/postpone") @ApiOperation({ summary: "Один раз отложить получение", description: "Продлевает срок получения заказа. Повторное отложение невозможно." }) postpone(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: PostponeOrderDto) { return this.orders.postpone(req.user.id, id, dto); }
  @Get("admin/orders") @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager, UserRole.employee)
  @ApiOperation({ summary: "Получить предзаказы для работы", description: "Администратор видит все заказы; менеджер и сотрудник — только заказы назначенных сервисов." }) adminOrders(@Request() req: { user: AuthenticatedUser }, @Query("includeArchived", new ParseBoolPipe({ optional: true })) includeArchived = false) { return this.orders.adminOrders(includeArchived, this.serviceAccess.serviceTypeIds(req.user)); }
  @Get("admin/calendar/events")
  @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager, UserRole.employee)
  @ApiOperation({ summary: "Получить события календаря", description: "Возвращает заказы, пересекающие указанный временной интервал, с фильтрами по клиентам, сервисам и статусам." }) calendarEvents(@Request() req: { user: AuthenticatedUser }, @Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) query: CalendarEventsQueryDto) { return this.orders.calendarEvents(query, this.serviceAccess.serviceTypeIds(req.user)); }
  @Get("admin/calendar/filter-options")
  @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager, UserRole.employee)
  @ApiOperation({ summary: "Получить фильтры календаря", description: "Возвращает доступные сервисы, позиции и статусы с учётом прав сотрудника." }) calendarFilterOptions(@Request() req: { user: AuthenticatedUser }) { return this.orders.calendarFilterOptions(this.serviceAccess.serviceTypeIds(req.user)); }
  @Get("admin/users/filter-options")
  @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager, UserRole.employee)
  @ApiOperation({ summary: "Получить клиентов для фильтра", description: "Ищет клиентов по контактным данным и ограничивает результат доступными сервисами." }) userFilterOptions(@Request() req: { user: AuthenticatedUser }, @Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) query: UserFilterOptionsQueryDto) { return this.orders.userFilterOptions(query.query, this.serviceAccess.serviceTypeIds(req.user)); }
  @Post("admin/orders/:id/propose-schedule") @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: "Предложить новое время заказа", description: "Переводит заказ в ожидание подтверждения клиентом; доступно администратору или менеджеру сервиса." }) async propose(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: ProposeScheduleDto) { await this.orders.assertOrderAccess(id, this.serviceAccess.serviceTypeIds(req.user)); return this.orders.proposeSchedule(id, dto); }
  @Patch("admin/orders/:id/status") @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager, UserRole.employee)
  @ApiOperation({ summary: "Изменить статус заказа", description: "Меняет статус по допустимому жизненному циклу заказа в пределах доступного сервиса." }) async setStatus(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: SetOrderStatusDto) { await this.orders.assertOrderAccess(id, this.serviceAccess.serviceTypeIds(req.user)); return this.orders.setStatus(id, dto); }
  @Patch("admin/orders/:id/archive") @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: "Архивировать заказ", description: "Архивирует только завершённый или отменённый заказ; доступно администратору и менеджеру." }) async archive(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: ArchiveOrderDto) { await this.orders.assertOrderAccess(id, this.serviceAccess.serviceTypeIds(req.user)); return this.orders.archive(id, dto.isArchived); }
}
