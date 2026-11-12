import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, Request, UseGuards, ValidationPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiCreatedResponse, ApiExtraModels, ApiOkResponse, ApiOperation, ApiResponse, ApiTags, getSchemaPath } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedUser } from "../auth/service-access.service";
import { UserRole } from "../generated/prisma/enums";
import { CompaniesService } from "./companies.service";
import { AddCompanyEmployeeDto, AllocateCompanyBalanceDto, ChargeCompanyQrDto, CreateCompanyDto, CreateCompanyTopUpDto } from "./dto/company.dto";
import { AllocationResponseDto, ApiErrorDto, CompanyLedgerEntryResponseDto, CompanyMemberResponseDto, CompanyQrChargeResponseDto, CompanyQrResponseDto, CompanyResponseDto, CompanyTopUpResponseDto, ConfirmTopUpResponseDto } from "../openapi/response.dto";

@ApiTags("companies")
@ApiBearerAuth()
@ApiExtraModels(ApiErrorDto, CompanyResponseDto, CompanyMemberResponseDto, CompanyTopUpResponseDto, AllocationResponseDto, CompanyQrResponseDto, CompanyLedgerEntryResponseDto, CompanyQrChargeResponseDto, ConfirmTopUpResponseDto)
@ApiResponse({ status: 400, description: "Некорректные параметры или тело запроса", type: ApiErrorDto })
@ApiResponse({ status: 401, description: "Требуется Bearer JWT", type: ApiErrorDto })
@ApiResponse({ status: 403, description: "Недостаточно прав или нет доступа к компании", type: ApiErrorDto })
@ApiResponse({ status: 404, description: "Компания, сотрудник, товар/услуга или заявка не найдены", type: ApiErrorDto })
@ApiResponse({ status: 409, description: "Конфликт состояния, дубликат или недостаточно средств", type: ApiErrorDto })
@Controller()
@UseGuards(AuthGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}
  @Post("companies") @ApiOperation({ summary: "Зарегистрировать компанию", description: "Создаёт организацию и делает текущего пользователя её владельцем." }) @ApiCreatedResponse({ description: "Компания создана", type: CompanyResponseDto })
  create(@Request() req: { user: AuthenticatedUser }, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: CreateCompanyDto) { return this.companies.create(req.user, dto); }
  @Get("companies/me") @ApiOperation({ summary: "Получить мои компании", description: "Возвращает компании, где текущий пользователь является владельцем или сотрудником." }) @ApiOkResponse({ schema: { type: "array", items: { $ref: getSchemaPath(CompanyResponseDto) } } })
  mine(@Request() req: { user: AuthenticatedUser }) { return this.companies.myCompanies(req.user); }
  @Get("companies/:id") @ApiOperation({ summary: "Получить компанию", description: "Доступно участнику компании или системному администратору." }) @ApiOkResponse({ type: CompanyResponseDto })
  get(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number) { return this.companies.getCompany(req.user, id); }
  @Post("companies/:id/employees") @ApiOperation({ summary: "Добавить сотрудника в компанию", description: "Добавляет существующего пользователя по userId либо создаёт обычную учётную запись сотрудника." }) @ApiCreatedResponse({ type: CompanyMemberResponseDto })
  addEmployee(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: AddCompanyEmployeeDto) { return this.companies.addEmployee(req.user, id, dto); }
  @Post("companies/:id/top-ups") @ApiOperation({ summary: "Создать заявку на пополнение", description: "Не начисляет деньги самостоятельно. Пополнение ждёт подтверждения администратором Экватора или будущим платёжным провайдером." }) @ApiCreatedResponse({ type: CompanyTopUpResponseDto })
  createTopUp(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: CreateCompanyTopUpDto) { return this.companies.createTopUp(req.user, id, dto); }
  @Get("companies/:id/top-ups") @ApiOperation({ summary: "Получить заявки на пополнение компании", description: "Показывает историю заявок и их статусы участнику компании." }) @ApiOkResponse({ schema: { type: "array", items: { $ref: getSchemaPath(CompanyTopUpResponseDto) } } })
  topUps(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number) { return this.companies.listTopUps(req.user, id); }
  @Post("companies/:id/employees/:memberId/allocations") @ApiOperation({ summary: "Выделить сотруднику корпоративный депозит", description: "Переводит средства с нераспределённого баланса компании на баланс активного сотрудника и создаёт две записи журнала." }) @ApiCreatedResponse({ type: AllocationResponseDto })
  allocate(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number, @Param("memberId", ParseIntPipe) memberId: number, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: AllocateCompanyBalanceDto) { return this.companies.allocate(req.user, id, memberId, dto); }
  @Get("companies/:id/employees/:memberId/qr") @ApiOperation({ summary: "Получить QR-токен сотрудника", description: "QR предназначен для показа сотрудником при будущей оплате услуг. Доступен самому сотруднику, владельцу компании или системному администратору." }) @ApiOkResponse({ type: CompanyQrResponseDto })
  qr(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number, @Param("memberId", ParseIntPipe) memberId: number) { return this.companies.memberQr(req.user, id, memberId); }
  @Get("companies/:id/ledger") @ApiOperation({ summary: "Получить журнал движения средств", description: "Неизменяемая история корпоративных пополнений и переводов сотрудникам." }) @ApiOkResponse({ schema: { type: "array", items: { $ref: getSchemaPath(CompanyLedgerEntryResponseDto) } } })
  ledger(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number) { return this.companies.ledger(req.user, id); }
  @Post("admin/company-qr/charges") @UseGuards(RolesGuard) @Roles(UserRole.admin, UserRole.manager) @ApiOperation({ summary: "Списать депозит сотрудника по QR", description: "Сумма берётся из текущей цены товара или услуги Экватора; списание и журнал проводятся атомарно. Менеджер ограничен своими сервисами." }) @ApiCreatedResponse({ type: CompanyQrChargeResponseDto })
  chargeByQr(@Request() req: { user: AuthenticatedUser }, @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: ChargeCompanyQrDto) { return this.companies.chargeByQr(req.user, dto); }
  @Post("admin/company-top-ups/:id/confirm") @UseGuards(RolesGuard) @Roles(UserRole.admin) @HttpCode(HttpStatus.OK) @ApiOperation({ summary: "Подтвердить пополнение компании", description: "Системный администратор подтверждает поступление денег; операция атомарно зачисляет средства и фиксируется в журнале." }) @ApiOkResponse({ type: ConfirmTopUpResponseDto })
  confirmTopUp(@Request() req: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number) { return this.companies.confirmTopUp(req.user, id); }
}
