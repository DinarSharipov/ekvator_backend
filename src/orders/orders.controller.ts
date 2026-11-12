import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseBoolPipe, ParseIntPipe, Patch, Post, Query, Request, UseGuards, ValidationPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AdminGuard } from "../auth/admin.guard";
import { AuthGuard } from "../auth/auth.guard";
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
  constructor(private readonly orders: OrdersService) {}
  @Get("cart") getCart(@Request() req: { user: { id: number } }) { return this.orders.getCart(req.user.id); }
  @Post("cart/items") addCartItem(@Request() req: { user: { id: number } }, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: AddCartItemDto) { return this.orders.addCartItem(req.user.id, dto); }
  @Patch("cart/items/:id") updateCartItem(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: UpdateCartItemDto) { return this.orders.updateCartItem(req.user.id, id, dto); }
  @Delete("cart/items/:id") @HttpCode(HttpStatus.NO_CONTENT) removeCartItem(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number) { return this.orders.removeCartItem(req.user.id, id); }
  @Post("orders") checkout(@Request() req: { user: { id: number } }, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: CheckoutDto) { return this.orders.checkout(req.user.id, dto); }
  @Get("orders/me") myOrders(@Request() req: { user: { id: number } }) { return this.orders.myOrders(req.user.id); }
  @Post("orders/:id/accept-proposal") accept(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number) { return this.orders.acceptProposal(req.user.id, id); }
  @Post("orders/:id/reject-proposal") reject(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number) { return this.orders.rejectProposal(req.user.id, id); }
  @Post("orders/:id/confirm-completion") confirmCompletion(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number) { return this.orders.confirmCompletion(req.user.id, id); }
  @Post("orders/:id/postpone") postpone(@Request() req: { user: { id: number } }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: PostponeOrderDto) { return this.orders.postpone(req.user.id, id, dto); }
  @Get("admin/orders") @UseGuards(AdminGuard) adminOrders(@Query("includeArchived", new ParseBoolPipe({ optional: true })) includeArchived = false) { return this.orders.adminOrders(includeArchived); }
  @Get("admin/calendar/events")
  @UseGuards(AdminGuard)
  calendarEvents(@Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) query: CalendarEventsQueryDto) { return this.orders.calendarEvents(query); }
  @Get("admin/calendar/filter-options")
  @UseGuards(AdminGuard)
  calendarFilterOptions() { return this.orders.calendarFilterOptions(); }
  @Get("admin/users/filter-options")
  @UseGuards(AdminGuard)
  userFilterOptions(@Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) query: UserFilterOptionsQueryDto) { return this.orders.userFilterOptions(query.query); }
  @Post("admin/orders/:id/propose-schedule") @UseGuards(AdminGuard) propose(@Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: ProposeScheduleDto) { return this.orders.proposeSchedule(id, dto); }
  @Patch("admin/orders/:id/status") @UseGuards(AdminGuard) setStatus(@Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: SetOrderStatusDto) { return this.orders.setStatus(id, dto); }
  @Patch("admin/orders/:id/archive") @UseGuards(AdminGuard) archive(@Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: ArchiveOrderDto) { return this.orders.archive(id, dto.isArchived); }
}
