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
  Request,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
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
import * as sharp from "sharp";
import { AuthGuard } from "../auth/auth.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedUser, ServiceAccessService } from "../auth/service-access.service";
import { UserRole } from "../generated/prisma/enums";
import { CreateServiceElementDto } from "./dto/create.service-element.dto";
import { ServiceElementService } from "./service-element.service";
import { ApiErrorDto, ServiceElementListItemResponseDto, ServiceElementResponseDto } from "../openapi/response.dto";

@ApiTags("service-elements")
@Controller("service-elements")
@ApiExtraModels(ApiErrorDto, ServiceElementResponseDto, ServiceElementListItemResponseDto)
@ApiResponse({ status: 400, description: "Некорректные параметры или multipart-данные", type: ApiErrorDto })
@ApiResponse({ status: 401, description: "Требуется Bearer JWT", type: ApiErrorDto })
@ApiResponse({ status: 403, description: "Недостаточно прав на сервис", type: ApiErrorDto })
@ApiResponse({ status: 404, description: "Услуга или сервис не найдены", type: ApiErrorDto })
export class ServiceElementsController {
  constructor(private readonly serviceElementService: ServiceElementService, private readonly serviceAccess: ServiceAccessService) {}

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Создать новую услугу", description: "Создаёт товар или услугу в указанном сервисе; менеджер ограничен назначенными сервисами." })
  @ApiCreatedResponse({ description: "Услуга успешно создана", type: ServiceElementResponseDto })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        price: { type: "number" },
        type: { type: "number" },
        photos: {
          type: "array",
          items: {
            type: "string",
            format: "binary",
          },
        }, // поле для файла
        isArchive: { type: "boolean" },
        preorderAvailable: { type: "boolean" },
      },
      required: ["name", "photos"],
    },
  })
  @UseInterceptors(FilesInterceptor("photos"))
  async create(
    @Request() request: { user: AuthenticatedUser },
    @Body() createServiceElement: CreateServiceElementDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    this.serviceAccess.assertCanAccessServices(request.user, [Number(createServiceElement.type)]);
    const base64Photos = files?.length
      ? await Promise.all(
          files.map(async (file) => {
            const webpBuffer = await sharp(file.buffer)
              .webp({ quality: 80 })
              .toBuffer();
            return webpBuffer.toString("base64");
          }),
        )
      : [];
    return this.serviceElementService.create({
      ...createServiceElement,
      price: createServiceElement.price,
      type: Number(createServiceElement.type),
      ...(createServiceElement.isArchive === undefined ? {} : { isArchive: String(createServiceElement.isArchive) === "true" }),
      ...(createServiceElement.preorderAvailable === undefined ? {} : { preorderAvailable: String(createServiceElement.preorderAvailable) === "true" }),
      photos: base64Photos,
      createdDate: createServiceElement.createdDate || new Date().toISOString(),
    });
  }

  @Put(":id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Изменить услугу", description: "Обновляет каталоговую позицию и флаги доступности предзаказа." })
  @ApiParam({ name: "id", type: "number", description: "ID услуги" })
  @ApiNoContentResponse({ description: "Услуга успешно изменена; тела ответа нет." })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        price: { type: "number" },
        type: { type: "number" },
        photos: {
          type: "array",
          items: {
            type: "string",
            format: "binary",
          },
        }, // поле для файла
        isArchive: { type: "boolean" },
        preorderAvailable: { type: "boolean" },
      },
      required: ["name", "price"],
    },
  })
  @UseInterceptors(FilesInterceptor("photos"))
  async update(
    @Request() request: { user: AuthenticatedUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() createServiceElement: CreateServiceElementDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const current = await this.serviceElementService.findOne(id);
    if (!current) return null;
    this.serviceAccess.assertCanAccessServices(request.user, [current.type, Number(createServiceElement.type)]);
    const base64Photos = files?.length
      ? await Promise.all(
          files.map(async (file) => {
            const webpBuffer = await sharp(file.buffer)
              .webp({ quality: 80 })
              .toBuffer();
            return webpBuffer.toString("base64");
          }),
        )
      : [];
    return this.serviceElementService.update(id, {
      ...createServiceElement,
      price: createServiceElement.price,
      type: Number(createServiceElement.type),
      ...(createServiceElement.isArchive === undefined ? {} : { isArchive: String(createServiceElement.isArchive) === "true" }),
      ...(createServiceElement.preorderAvailable === undefined ? {} : { preorderAvailable: String(createServiceElement.preorderAvailable) === "true" }),
      photos: base64Photos,
    });
  }

  @Get()
  @ApiOperation({ summary: "Получить список всех услуг", description: "Возвращает все каталоговые позиции." })
  @ApiOkResponse({ description: "Список услуг", type: ServiceElementListItemResponseDto, isArray: true })
  findAll() {
    return this.serviceElementService.findAll();
  }

  @Get("byId/:id")
  @ApiOperation({ summary: "Получить список по типу сервиса", description: "Возвращает каталоговые позиции одного сервиса." })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiOkResponse({ description: "Список услуг", type: ServiceElementResponseDto, isArray: true })
  findAllByServiceId(@Param("id", ParseIntPipe) id: number) {
    return this.serviceElementService.findAllByServiceId(id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить услугу по ID", description: "Возвращает одну каталоговую позицию по идентификатору." })
  @ApiParam({ name: "id", type: "number", description: "ID услуги" })
  @ApiOkResponse({ description: "Услуга найдена", type: ServiceElementResponseDto })
  @ApiNotFoundResponse({ description: "Услуга не найдена", type: ApiErrorDto })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.serviceElementService.findOne(id);
  }

  @Delete(":id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Удалить услугу по ID", description: "Удаляет каталоговую позицию при наличии прав на её сервис." })
  @ApiParam({ name: "id", type: "number", description: "ID услуги" })
  @ApiNoContentResponse({ description: "Услуга удалена; тела ответа нет." })
  async remove(@Request() request: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: string) {
    const current = await this.serviceElementService.findOne(+id);
    if (!current) return null;
    this.serviceAccess.assertCanAccessServices(request.user, [current.type]);
    return this.serviceElementService.remove(+id);
  }
}

