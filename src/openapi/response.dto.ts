import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BookingMode, CompanyLedgerKind, CompanyMemberRole, CompanyTopUpStatus, PaymentStatus, PreorderStatus, UserRole } from "../generated/prisma/enums";

const money = { type: Number, format: "int32", minimum: 0, maximum: 2_147_483_647, description: "Сумма в копейках (amountMinor): 100 ₽ = 10 000." } as const;
const date = { type: String, format: "date-time" } as const;

export class ApiErrorDto {
  @ApiProperty({ example: 409 }) statusCode: number;
  @ApiProperty({ oneOf: [{ type: "string", example: "Недостаточно средств" }, { type: "array", items: { type: "string" }, example: ["amountMinor must not be less than 1"] }] }) message: string | string[];
  @ApiProperty({ example: "Conflict" }) error: string;
  @ApiPropertyOptional({ example: "WEATHER_PROVIDER_UNAVAILABLE", description: "Стабильный машинный код присутствует только у ошибок, которые его поддерживают." }) code?: string;
}

export class UserSummaryResponseDto {
  @ApiProperty({ example: 17 }) id: number;
  @ApiProperty({ example: "Иван" }) name: string;
  @ApiPropertyOptional({ nullable: true, example: "Петров" }) surname: string | null;
  @ApiProperty({ example: "ivan.petrov" }) login: string;
  @ApiPropertyOptional({ nullable: true, example: "+79990000000" }) phone: string | null;
  @ApiPropertyOptional({ nullable: true, format: "email", example: "driver@example.com" }) email: string | null;
}

export class UserResponseDto extends UserSummaryResponseDto {
  @ApiPropertyOptional({ nullable: true, example: "@ivan" }) telegram: string | null;
  @ApiProperty({ enum: UserRole, example: UserRole.user }) userRole: UserRole;
  @ApiProperty({ example: "user", description: "Legacy role field retained for backwards compatibility." }) role: string;
  @ApiPropertyOptional({ ...date, nullable: true }) phoneVerifiedAt: Date | null;
  @ApiProperty({ type: "array", items: { type: "object", required: ["serviceTypeId"], properties: { serviceTypeId: { type: "integer", example: 1 } } }, example: [{ serviceTypeId: 1 }], description: "Назначения на сервисы." }) serviceAssignments: { serviceTypeId: number }[];
}
export class AuthResponseDto { @ApiProperty({ description: "Bearer JWT для заголовка Authorization.", example: "eyJhbGciOiJIUzI1NiJ9…" }) access_token: string; @ApiProperty({ type: () => UserResponseDto }) user: UserResponseDto; }
export class AuthFeaturesResponseDto { @ApiProperty({ example: false }) smsVerificationEnabled: boolean; }

export class ServiceTypeResponseDto {
  @ApiProperty({ example: 1 }) id: number; @ApiProperty({ example: 0, minimum: 0 }) sortOrder: number; @ApiProperty({ maxLength: 200, example: "Шиномонтаж" }) name: string; @ApiProperty({ example: false }) showInMain: boolean;
  @ApiPropertyOptional({ nullable: true, example: "+79990000000" }) phone: string | null; @ApiPropertyOptional({ nullable: true, example: "+79990000001" }) secondPhone: string | null; @ApiPropertyOptional({ nullable: true, description: "Base64-изображение главной фотографии." }) photo: string | null;
  @ApiPropertyOptional({ nullable: true, maxLength: 5000 }) description: string | null; @ApiPropertyOptional({ nullable: true, example: "table" }) showType: string | null; @ApiProperty({ type: [String], description: "Массив Base64-изображений галереи." }) gallery: string[];
  @ApiProperty({ example: true }) acceptsPreorders: boolean; @ApiProperty({ example: true }) allowMixedCart: boolean; @ApiProperty({ enum: BookingMode, example: BookingMode.appointment }) bookingMode: BookingMode; @ApiProperty({ minimum: 1, example: 1 }) bookingCapacity: number; @ApiProperty({ example: false, description: "Флаг будущей предоплаты." }) prepaymentEnabled: boolean;
}
export class ServiceTypeListItemResponseDto {
  @ApiProperty({ example: 1 }) id: number; @ApiProperty({ example: 0, minimum: 0 }) sortOrder: number; @ApiProperty({ example: "Шиномонтаж" }) name: string; @ApiPropertyOptional({ nullable: true }) description: string | null;
  @ApiPropertyOptional({ nullable: true }) phone: string | null; @ApiPropertyOptional({ nullable: true }) secondPhone: string | null; @ApiPropertyOptional({ nullable: true }) photo: string | null; @ApiProperty({ example: false }) showInMain: boolean; @ApiPropertyOptional({ nullable: true }) showType: string | null;
  @ApiProperty({ example: true }) acceptsPreorders: boolean; @ApiProperty({ example: true }) allowMixedCart: boolean; @ApiProperty({ enum: BookingMode }) bookingMode: BookingMode; @ApiProperty({ minimum: 1 }) bookingCapacity: number; @ApiProperty({ example: false }) prepaymentEnabled: boolean;
}
export class OrderPermissionResponseDto { @ApiProperty({ example: true }) canReorder: boolean; }

export class CompanyMemberResponseDto {
  @ApiProperty({ example: 8 }) id: number;
  @ApiProperty({ example: 42 }) companyId: number;
  @ApiProperty({ example: 17 }) userId: number;
  @ApiProperty({ enum: CompanyMemberRole, example: CompanyMemberRole.employee }) role: CompanyMemberRole;
  @ApiProperty(money) balanceMinor: number;
  @ApiProperty({ example: true }) isActive: boolean;
  @ApiProperty(date) createdAt: Date;
  @ApiProperty(date) updatedAt: Date;
  @ApiProperty({ type: () => UserSummaryResponseDto }) user: UserSummaryResponseDto;
}

export class CompanyResponseDto {
  @ApiProperty({ example: 3 }) id: number;
  @ApiProperty({ maxLength: 200, example: "ООО Транспорт" }) name: string;
  @ApiPropertyOptional({ nullable: true, maxLength: 12, example: "1650123456" }) inn: string | null;
  @ApiProperty({ example: 17, description: "ID пользователя, создавшего компанию." }) createdById: number;
  @ApiProperty(money) balanceMinor: number;
  @ApiProperty(money) unallocatedBalanceMinor: number;
  @ApiProperty(money) corporateBalanceMinor: number;
  @ApiProperty({ type: () => CompanyMemberResponseDto, description: "Участник с ролью owner; null только для исторически повреждённых данных.", nullable: true }) owner: CompanyMemberResponseDto | null;
  @ApiProperty({ type: () => CompanyMemberResponseDto, isArray: true }) members: CompanyMemberResponseDto[];
  @ApiProperty(date) createdAt: Date;
  @ApiProperty(date) updatedAt: Date;
}

export class CompanyTopUpResponseDto {
  @ApiProperty({ example: 91 }) id: number;
  @ApiProperty({ example: 3 }) companyId: number;
  @ApiProperty(money) amountMinor: number;
  @ApiPropertyOptional({ nullable: true, maxLength: 500, example: "Оплата по счёту №15" }) note: string | null;
  @ApiProperty({ enum: CompanyTopUpStatus, example: CompanyTopUpStatus.pending }) status: CompanyTopUpStatus;
  @ApiProperty({ example: 17 }) createdById: number;
  @ApiPropertyOptional({ nullable: true, example: 1 }) confirmedById: number | null;
  @ApiProperty(date) createdAt: Date;
  @ApiPropertyOptional({ ...date, nullable: true }) confirmedAt: Date | null;
  @ApiProperty({ type: () => UserSummaryResponseDto }) createdBy: UserSummaryResponseDto;
  @ApiPropertyOptional({ type: () => UserSummaryResponseDto, nullable: true }) confirmedBy: UserSummaryResponseDto | null;
}

export class AllocationResponseDto {
  @ApiProperty({ format: "uuid", description: "Идентификатор операции распределения; одинаковый в двух связанных проводках." }) transferId: string;
  @ApiProperty({ example: 3 }) companyId: number;
  @ApiProperty({ example: 8 }) memberId: number;
  @ApiProperty(money) amountMinor: number;
  @ApiPropertyOptional({ nullable: true, maxLength: 500 }) note: string | null;
  @ApiProperty(money) companyBalanceMinor: number;
  @ApiProperty(money) memberBalanceMinor: number;
  @ApiProperty(date) createdAt: Date;
}

export class CompanyQrResponseDto {
  @ApiProperty({ example: "ekvator-company-v1:3a0e31ce-756b-46e9-8900-15fd5cfa4656" }) qrToken: string;
  @ApiPropertyOptional({ ...date, nullable: true, description: "null: текущие QR-токены не имеют срока действия; поле зарезервировано для ротации токенов." }) expiresAt: Date | null;
  @ApiProperty({ example: 3 }) companyId: number;
  @ApiProperty({ example: 8 }) memberId: number;
  @ApiProperty({ type: () => UserSummaryResponseDto }) employee: UserSummaryResponseDto;
  @ApiProperty(money) balanceMinor: number;
  @ApiProperty({ example: true }) isActive: boolean;
}

export class CompanyLedgerEntryResponseDto {
  @ApiProperty({ example: 301 }) id: number;
  @ApiProperty({ example: 3 }) companyId: number;
  @ApiPropertyOptional({ nullable: true, example: 8 }) companyMemberId: number | null;
  @ApiProperty({ enum: CompanyLedgerKind, example: CompanyLedgerKind.allocation }) kind: CompanyLedgerKind;
  @ApiProperty({ type: Number, format: "int32", minimum: -2_147_483_647, maximum: 2_147_483_647, description: "Изменение баланса в копейках: положительное — зачисление, отрицательное — списание." }) amountMinor: number;
  @ApiPropertyOptional({ nullable: true, format: "uuid" }) transferId: string | null;
  @ApiPropertyOptional({ nullable: true, description: "Служебная ссылка/комментарий операции." }) reference: string | null;
  @ApiProperty({ type: Number, format: "int32", minimum: 0, maximum: 2147483647, description: "Баланс затронутого счёта в копейках до проводки." }) balanceBeforeMinor: number;
  @ApiProperty({ type: Number, format: "int32", minimum: 0, maximum: 2147483647, description: "Баланс затронутого счёта в копейках после проводки." }) balanceAfterMinor: number;
  @ApiPropertyOptional({ nullable: true, example: 91, description: "ID заявки на пополнение, если запись создана её подтверждением." }) relatedTopUpId: number | null;
  @ApiPropertyOptional({ nullable: true, example: 42, description: "ID оплаченной позиции, если запись создана QR-списанием." }) relatedServiceElementId: number | null;
  @ApiPropertyOptional({ nullable: true, example: 1 }) createdById: number | null;
  @ApiProperty(date) createdAt: Date;
  @ApiPropertyOptional({ type: () => CompanyMemberResponseDto, nullable: true }) companyMember: CompanyMemberResponseDto | null;
}

export class CompanyQrChargeResponseDto {
  @ApiProperty({ example: 301, description: "ID записи журнала списания." }) ledgerEntryId: number;
  @ApiProperty({ example: 3 }) companyId: number;
  @ApiProperty({ example: 8 }) memberId: number;
  @ApiProperty({ example: 42 }) serviceElementId: number;
  @ApiProperty({ minimum: 1, maximum: 2147483647, example: 2 }) quantity: number;
  @ApiProperty(money) amountMinor: number;
  @ApiProperty(money) memberBalanceMinor: number;
}

export class ConfirmTopUpResponseDto {
  @ApiProperty({ type: () => CompanyTopUpResponseDto }) topUp: CompanyTopUpResponseDto;
  @ApiProperty(money) companyBalanceMinor: number;
}

export class ServiceElementResponseDto {
  @ApiProperty() id: number; @ApiProperty() name: string; @ApiPropertyOptional({ nullable: true }) description: string | null; @ApiProperty({ example: 250 }) price: number;
  @ApiProperty({ type: [String] }) photos: string[]; @ApiProperty() type: number; @ApiProperty(date) createdDate: Date; @ApiProperty() isArchive: boolean; @ApiProperty() preorderAvailable: boolean;
}
export class ServiceElementListItemResponseDto {
  @ApiProperty() id: number; @ApiProperty() name: string; @ApiPropertyOptional({ nullable: true }) description: string | null; @ApiProperty({ example: 250, description: "Цена в рублях." }) price: number;
  @ApiProperty() type: number; @ApiProperty(date) createdDate: Date; @ApiProperty() isArchive: boolean; @ApiProperty() preorderAvailable: boolean;
}
export class CartItemResponseDto { @ApiProperty() id: number; @ApiProperty() cartId: number; @ApiProperty() serviceElementId: number; @ApiProperty({ minimum: 1 }) quantity: number; @ApiProperty(date) createdAt: Date; @ApiProperty(date) updatedAt: Date; @ApiProperty({ type: () => ServiceElementResponseDto }) serviceElement: ServiceElementResponseDto; }
export class CartResponseDto { @ApiPropertyOptional({ nullable: true }) id: number | null; @ApiProperty() userId: number; @ApiProperty({ type: () => CartItemResponseDto, isArray: true }) items: CartItemResponseDto[]; @ApiPropertyOptional({ ...date, nullable: true }) createdAt?: Date | null; @ApiPropertyOptional({ ...date, nullable: true }) updatedAt?: Date | null; }

export class OrderServiceResponseDto { @ApiProperty() id: number; @ApiProperty() name: string; @ApiProperty({ enum: BookingMode }) bookingMode: BookingMode; @ApiProperty({ minimum: 1 }) bookingCapacity: number; }
export class OrderItemResponseDto { @ApiProperty() id: number; @ApiProperty() preorderId: number; @ApiProperty() serviceElementId: number; @ApiProperty() serviceTypeId: number; @ApiProperty() name: string; @ApiProperty() price: number; @ApiProperty({ minimum: 1 }) quantity: number; @ApiProperty({ type: () => OrderServiceResponseDto }) serviceType: OrderServiceResponseDto; }
export class OrderResponseDto {
  @ApiProperty() id: number; @ApiProperty() userId: number; @ApiProperty({ enum: PreorderStatus }) status: PreorderStatus;
  @ApiProperty(date) desiredStartAt: Date; @ApiPropertyOptional({ ...date, nullable: true }) desiredEndAt: Date | null; @ApiProperty(date) scheduledStartAt: Date; @ApiPropertyOptional({ ...date, nullable: true }) scheduledEndAt: Date | null; @ApiProperty(date) completionDueAt: Date;
  @ApiPropertyOptional({ ...date, nullable: true }) postponedUntil: Date | null; @ApiProperty() postponementUsed: boolean; @ApiPropertyOptional({ nullable: true }) customerNote: string | null; @ApiPropertyOptional({ nullable: true }) adminNote: string | null; @ApiPropertyOptional({ ...date, nullable: true }) proposedStartAt: Date | null; @ApiPropertyOptional({ ...date, nullable: true }) proposedEndAt: Date | null; @ApiPropertyOptional({ nullable: true }) proposalNote: string | null; @ApiProperty({ enum: PaymentStatus }) paymentStatus: PaymentStatus; @ApiProperty() paymentFeatureEnabled: boolean; @ApiProperty() isArchived: boolean; @ApiProperty(date) createdAt: Date; @ApiProperty(date) updatedAt: Date; @ApiProperty({ type: () => UserSummaryResponseDto }) user: UserSummaryResponseDto; @ApiProperty({ type: () => OrderItemResponseDto, isArray: true }) items: OrderItemResponseDto[]; @ApiProperty({ description: "Итог в рублях, как сумма снимков price × quantity." }) total: number;
}
export class CalendarItemResponseDto extends OrderItemResponseDto { @ApiProperty({ type: () => OrderServiceResponseDto }) service: OrderServiceResponseDto; }
export class CalendarEventResponseDto { @ApiProperty() id: string; @ApiProperty() orderId: number; @ApiProperty() title: string; @ApiProperty(date) startAt: Date; @ApiPropertyOptional({ ...date, nullable: true }) endAt: Date | null; @ApiProperty({ enum: ["scheduled", "proposed"] }) timeSource: "scheduled" | "proposed"; @ApiProperty({ enum: PreorderStatus }) status: PreorderStatus; @ApiProperty() isArchived: boolean; @ApiProperty({ type: () => UserSummaryResponseDto }) customer: UserSummaryResponseDto; @ApiProperty({ type: () => CalendarItemResponseDto, isArray: true }) items: CalendarItemResponseDto[]; @ApiPropertyOptional({ nullable: true }) customerNote: string | null; @ApiPropertyOptional({ nullable: true }) adminNote: string | null; @ApiPropertyOptional({ nullable: true }) proposalNote: string | null; @ApiProperty(date) createdAt: Date; @ApiProperty(date) updatedAt: Date; @ApiProperty() total: number; }
export class CalendarServiceFilterResponseDto { @ApiProperty() id: number; @ApiProperty() name: string; @ApiProperty() sortOrder: number; @ApiProperty({ enum: BookingMode }) bookingMode: BookingMode; @ApiProperty() bookingCapacity: number; @ApiProperty() acceptsPreorders: boolean; }
export class CalendarElementFilterResponseDto { @ApiProperty() id: number; @ApiProperty() name: string; @ApiProperty() type: number; @ApiProperty() isArchive: boolean; @ApiProperty() preorderAvailable: boolean; }
export class CalendarFilterOptionsResponseDto { @ApiProperty({ type: () => CalendarServiceFilterResponseDto, isArray: true }) services: CalendarServiceFilterResponseDto[]; @ApiProperty({ type: () => CalendarElementFilterResponseDto, isArray: true }) serviceElements: CalendarElementFilterResponseDto[]; @ApiProperty({ enum: PreorderStatus, isArray: true }) statuses: PreorderStatus[]; }
export class UserFilterOptionResponseDto extends UserSummaryResponseDto { @ApiPropertyOptional({ nullable: true }) email: string | null; @ApiPropertyOptional({ nullable: true }) telegram: string | null; @ApiProperty() role: string; @ApiProperty() userRole: string; @ApiProperty() label: string; }

export class AnalyticsAcceptedResponseDto { @ApiProperty({ minimum: 0, maximum: 50, example: 2, description: "Число новых событий, сохранённых из пакета. Повторный eventId не увеличивает счётчик." }) accepted: number; }
export class AnalyticsPeriodResponseDto { @ApiProperty(date) from: Date; @ApiProperty(date) to: Date; }
export class AnalyticsTotalsResponseDto { @ApiProperty({ minimum: 0, example: 125 }) pageViews: number; @ApiProperty({ minimum: 0, example: 42 }) clicks: number; @ApiProperty({ minimum: 0, example: 86 }) uniqueVisitors: number; @ApiProperty({ minimum: 0, example: 18 }) authenticatedUsers: number; }
export class AnalyticsDayResponseDto extends AnalyticsTotalsResponseDto { @ApiProperty({ format: "date", example: "2026-11-12" }) date: string; }
export class AnalyticsServiceResponseDto { @ApiProperty({ example: 1 }) serviceTypeId: number; @ApiPropertyOptional({ nullable: true, example: "Шиномонтаж" }) name: string | null; @ApiProperty({ minimum: 0, example: 23 }) clicks: number; }
export class AnalyticsTargetResponseDto { @ApiProperty({ maxLength: 120, example: "cart.checkout" }) target: string; @ApiProperty({ minimum: 0, example: 15 }) clicks: number; }
export class AnalyticsOverviewResponseDto {
  @ApiProperty({ type: () => AnalyticsPeriodResponseDto }) period: AnalyticsPeriodResponseDto;
  @ApiProperty({ type: () => AnalyticsTotalsResponseDto }) totals: AnalyticsTotalsResponseDto;
  @ApiProperty({ type: () => AnalyticsDayResponseDto, isArray: true }) days: AnalyticsDayResponseDto[];
  @ApiProperty({ type: () => AnalyticsServiceResponseDto, isArray: true }) topServices: AnalyticsServiceResponseDto[];
  @ApiProperty({ type: () => AnalyticsTargetResponseDto, isArray: true }) topTargets: AnalyticsTargetResponseDto[];
}
