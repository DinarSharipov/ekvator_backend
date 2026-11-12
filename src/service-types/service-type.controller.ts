import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { memoryStorage } from "multer";
import * as sharp from "sharp";
import { AdminGuard } from "../auth/admin.guard";
import { AuthGuard } from "../auth/auth.guard";
import { CreateServiceTypeDto } from "./dto/create.service-type.dto";
import { ServiceTypeService } from "./service-type.service";
import { ReorderServicesDto } from "./dto/reorder-services.dto";
import { ApiErrorDto, OrderPermissionResponseDto, ServiceTypeListItemResponseDto, ServiceTypeResponseDto } from "../openapi/response.dto";

@ApiTags("services")
@Controller("services")
@ApiExtraModels(ApiErrorDto, ServiceTypeResponseDto, ServiceTypeListItemResponseDto, OrderPermissionResponseDto)
@ApiResponse({ status: 400, description: "Некорректные параметры, порядок или multipart-данные", type: ApiErrorDto })
@ApiResponse({ status: 401, description: "Требуется Bearer JWT", type: ApiErrorDto })
@ApiResponse({ status: 403, description: "Недостаточно прав", type: ApiErrorDto })
@ApiResponse({ status: 404, description: "Сервис не найден", type: ApiErrorDto })
export class ServiceTypesController {
  constructor(private readonly serviceTypeService: ServiceTypeService) {}

  @Post()
  @UseGuards(AuthGuard, AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Создать новый тип сервиса", description: "Создаёт сервис Экватора и его настройки отображения, предзаказов и бронирования." })
  @ApiCreatedResponse({ description: "Сервис успешно создан", type: ServiceTypeResponseDto })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        showInMain: { type: "boolean" },
        phone: { type: "string" },
        secondPhone: { type: "string" },
        description: { type: "string" },
        photo: { type: "string", format: "binary" },
        gallery: {
          type: "array",
          items: {
            type: "string",
            format: "binary",
          },
        },
        acceptsPreorders: { type: "boolean" },
        allowMixedCart: { type: "boolean" },
        bookingMode: { type: "string", enum: ["appointment", "duration"] },
        bookingCapacity: { type: "number", minimum: 1 },
        prepaymentEnabled: { type: "boolean" },
      },
      required: ["name", "photo"],
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "photo", maxCount: 1 },
        { name: "gallery", maxCount: 10 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 },
      },
    ),
  )
  async create(
    @Body() createServiceType: CreateServiceTypeDto,
    @UploadedFiles()
    files: {
      photo?: Express.Multer.File;
      gallery?: Express.Multer.File[];
    },
  ) {
    // Конвертируем main photo в webp
    const base64Photo = files?.photo?.[0]
      ? (
          await sharp(files.photo[0].buffer).webp({ quality: 80 }).toBuffer()
        ).toString("base64")
      : null;

    // Конвертируем все файлы галереи в webp
    const base64Gallery = files?.gallery
      ? await Promise.all(
          files.gallery.map(async (file) => {
            const webpBuffer = await sharp(file.buffer)
              .webp({ quality: 80 })
              .toBuffer();
            return webpBuffer.toString("base64");
          }),
        )
      : [];

    return this.serviceTypeService.create({
      ...createServiceType,
      showInMain: String(createServiceType.showInMain) === "true",
      acceptsPreorders: String(createServiceType.acceptsPreorders) === "true",
      allowMixedCart: createServiceType.allowMixedCart === undefined ? true : String(createServiceType.allowMixedCart) === "true",
      prepaymentEnabled: String(createServiceType.prepaymentEnabled) === "true",
      photo: base64Photo,
      gallery: base64Gallery,
    });
  }

  @Get()
  @ApiOperation({ summary: "Получить список всех сервисов", description: "Возвращает сервисы Экватора в сохранённом порядке." })
  @ApiOkResponse({ description: "Список сервисов", type: ServiceTypeListItemResponseDto, isArray: true })
  findAll() {
    return this.serviceTypeService.findAll();
  }

  @Get("order-permission")
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: "Проверить доступ к изменению порядка", description: "Служебная проверка права системного администратора на изменение порядка сервисов." })
  @ApiOkResponse({ type: OrderPermissionResponseDto })
  orderPermission() { return { canReorder: true }; }

  @Put("order")
  @UseGuards(AuthGuard, AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Сохранить порядок всех сервисов", description: "Атомарно заменяет порядок полного списка сервисов; защищён от устаревшего или неполного списка." })
  @ApiNoContentResponse({ description: "Порядок сохранён; тела ответа нет." })
  @ApiConflictResponse({ description: "Передан устаревший или неполный список ID", type: ApiErrorDto })
  reorder(@Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) dto: ReorderServicesDto) {
    return this.serviceTypeService.reorder(dto.ids);
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить сервис по ID", description: "Возвращает настройки одного сервиса Экватора." })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiOkResponse({ description: "Сервис найден", type: ServiceTypeResponseDto })
  @ApiNotFoundResponse({ description: "Сервис не найден", type: ApiErrorDto })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.serviceTypeService.findOne(id);
  }

  @Delete(":id")
  @UseGuards(AuthGuard, AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Удалить сервис по ID", description: "Удаляет сервис. Операция может быть отклонена БД при наличии связанных исторических данных." })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiNoContentResponse({ description: "Сервис удален; тела ответа нет." })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.serviceTypeService.remove(id);
  }

  @Put(":id")
  @UseGuards(AuthGuard, AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Обновить сервис по ID", description: "Обновляет данные и настройки сервиса Экватора." })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiNoContentResponse({ description: "Сервис изменен; тела ответа нет." })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        showInMain: { type: "boolean" },
        phone: { type: "string" },
        secondPhone: { type: "string" },
        description: { type: "string" },
        photo: { type: "string", format: "binary" },
        gallery: {
          type: "array",
          items: {
            type: "string",
            format: "binary",
          },
        },
        acceptsPreorders: { type: "boolean" },
        allowMixedCart: { type: "boolean" },
        bookingMode: { type: "string", enum: ["appointment", "duration"] },
        bookingCapacity: { type: "number", minimum: 1 },
        prepaymentEnabled: { type: "boolean" },
      },
      required: ["name", "photo"],
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: "photo", maxCount: 1 },
        { name: "gallery", maxCount: 10 },
      ],
      {
        storage: memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 },
      },
    ),
  )
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() createServiceType: CreateServiceTypeDto,
    @UploadedFiles()
    files: {
      photo?: Express.Multer.File;
      gallery?: Express.Multer.File[];
    },
  ) {
    // Конвертируем main photo в webp
    const base64Photo = files?.photo?.[0]
      ? (
          await sharp(files.photo[0].buffer).webp({ quality: 80 }).toBuffer()
        ).toString("base64")
      : null;

    // Конвертируем все файлы галереи в webp
    const base64Gallery = files?.gallery
      ? await Promise.all(
          files.gallery.map(async (file) => {
            const webpBuffer = await sharp(file.buffer)
              .webp({ quality: 80 })
              .toBuffer();
            return webpBuffer.toString("base64");
          }),
        )
      : [];

    return this.serviceTypeService.update(id, {
      ...createServiceType,
      showInMain: String(createServiceType.showInMain) === "true",
      ...(createServiceType.acceptsPreorders === undefined ? {} : { acceptsPreorders: String(createServiceType.acceptsPreorders) === "true" }),
      ...(createServiceType.allowMixedCart === undefined ? {} : { allowMixedCart: String(createServiceType.allowMixedCart) === "true" }),
      ...(createServiceType.bookingCapacity === undefined ? {} : { bookingCapacity: Number(createServiceType.bookingCapacity) }),
      ...(createServiceType.prepaymentEnabled === undefined ? {} : { prepaymentEnabled: String(createServiceType.prepaymentEnabled) === "true" }),
      photo: base64Photo,
      gallery: base64Gallery,
    });
  }
}

