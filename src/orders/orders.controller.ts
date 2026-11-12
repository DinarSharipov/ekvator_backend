import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseBoolPipe, ParseIntPipe, Patch, Post, Query, Request, UseGuards, ValidationPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
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
  @Get("admin/orders") @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager, UserRole.employee)
  adminOrders(@Request() req: { user: AuthenticatedUser }, @Query("includeArchived", new ParseBoolPipe({ optional: true })) includeArchived = false) { return this.orders.adminOrders(includeArchived, this.serviceAccess.serviceTypeIds(req.user)); }
  @Get("admin/calendar/events")
  @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager, UserRole.employee)
  calendarEvents(@Request() req: { user: AuthenticatedUser }, @Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) query: CalendarEventsQueryDto) { return this.orders.calendarEvents(query, this.serviceAccess.serviceTypeIds(req.user)); }
  @Get("admin/calendar/filter-options")
  @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager, UserRole.employee)
  calendarFilterOptions(@Request() req: { user: AuthenticatedUser }) { return this.orders.calendarFilterOptions(this.serviceAccess.serviceTypeIds(req.user)); }
  @Get("admin/users/filter-options")
  @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager, UserRole.employee)
  userFilterOptions(@Request() req: { user: AuthenticatedUser }, @Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) query: UserFilterOptionsQueryDto) { return this.orders.userFilterOptions(query.query, this.serviceAccess.serviceTypeIds(req.user)); }
  @Post("admin/orders/:id/propose-schedule") @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager)
  async propose(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: ProposeScheduleDto) { await this.orders.assertOrderAccess(id, this.serviceAccess.serviceTypeIds(req.user)); return this.orders.proposeSchedule(id, dto); }
  @Patch("admin/orders/:id/status") @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager, UserRole.employee)
  async setStatus(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: SetOrderStatusDto) { await this.orders.assertOrderAccess(id, this.serviceAccess.serviceTypeIds(req.user)); return this.orders.setStatus(id, dto); }
  @Patch("admin/orders/:id/archive") @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager)
  async archive(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: ArchiveOrderDto) { await this.orders.assertOrderAccess(id, this.serviceAccess.serviceTypeIds(req.user)); return this.orders.archive(id, dto.isArchived); }
}
