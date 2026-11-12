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

@ApiTags("service-elements")
@Controller("service-elements")
export class ServiceElementsController {
  constructor(private readonly serviceElementService: ServiceElementService, private readonly serviceAccess: ServiceAccessService) {}

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Создать новую услугу", description: "Создаёт товар или услугу в указанном сервисе; менеджер ограничен назначенными сервисами." })
  @ApiResponse({ status: 201, description: "Услуга успешно создан" })
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
  @ApiResponse({ status: 201, description: "Услуга успешно изменена" })
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
  @ApiResponse({ status: 200, description: "Список услуг" })
  findAll() {
    return this.serviceElementService.findAll();
  }

  @Get("byId/:id")
  @ApiOperation({ summary: "Получить список по типу сервиса", description: "Возвращает каталоговые позиции одного сервиса." })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiResponse({ status: 200, description: "Список услуг" })
  findAllByServiceId(@Param("id", ParseIntPipe) id: number) {
    return this.serviceElementService.findAllByServiceId(id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить услугу по ID", description: "Возвращает одну каталоговую позицию по идентификатору." })
  @ApiParam({ name: "id", type: "number", description: "ID услуги" })
  @ApiResponse({ status: 200, description: "Услуга не найден" })
  @ApiResponse({ status: 404, description: "Услуга не найден" })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.serviceElementService.findOne(id);
  }

  @Delete(":id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Удалить услугу по ID", description: "Удаляет каталоговую позицию при наличии прав на её сервис." })
  @ApiParam({ name: "id", type: "number", description: "ID услуги" })
  @ApiResponse({ status: 204, description: "Услуга удалена" })
  async remove(@Request() request: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: string) {
    const current = await this.serviceElementService.findOne(+id);
    if (!current) return null;
    this.serviceAccess.assertCanAccessServices(request.user, [current.type]);
    return this.serviceElementService.remove(+id);
  }
}

