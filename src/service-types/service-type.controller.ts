import { PrivilegesGuard, RequirePrivileges } from "../auth/privileges.guard";
import { AuthenticatedUser, ServiceAccessService } from "../auth/service-access.service";
import {
  BadRequestException,
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
  ValidationPipe,
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiBodyOptions,
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
import { AuthGuard } from "../auth/auth.guard";
import { CreateServiceTypeDto } from "./dto/create.service-type.dto";
import { ServiceTypeService } from "./service-type.service";
import { ReorderServicesDto } from "./dto/reorder-services.dto";
import { ApiErrorDto, OrderPermissionResponseDto, ServiceTypeListItemResponseDto, ServiceTypeResponseDto } from "../openapi/response.dto";

const serviceTypeMultipartBody: ApiBodyOptions = {
  schema: {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 200 },
      showInMain: { type: "boolean" },
      phone: { type: "string" },
      secondPhone: { type: "string" },
      description: { type: "string", maxLength: 5000 },
      showType: { type: "string", enum: ["table", "blocks"] },
      kind: { type: "string", enum: ["goods", "services"] },
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
      bookingCapacity: { type: "integer", minimum: 1, maximum: 2147483647 },
      prepaymentEnabled: { type: "boolean" },
    },
    required: ["name"],
  },
};

@ApiTags("services")
@Controller("services")
@ApiExtraModels(ApiErrorDto, ServiceTypeResponseDto, ServiceTypeListItemResponseDto, OrderPermissionResponseDto)
@ApiResponse({ status: 400, description: "Некорректные параметры, порядок или multipart-данные", type: ApiErrorDto })
@ApiResponse({ status: 401, description: "Требуется Bearer JWT", type: ApiErrorDto })
@ApiResponse({ status: 403, description: "Недостаточно прав", type: ApiErrorDto })
@ApiResponse({ status: 404, description: "Сервис не найден", type: ApiErrorDto })
export class ServiceTypesController {
  constructor(private readonly serviceTypeService: ServiceTypeService, private readonly serviceAccess: ServiceAccessService) {}

  @Post()
  @UseGuards(AuthGuard, PrivilegesGuard)
  @RequirePrivileges("services.create")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Создать новый тип сервиса", description: "Создаёт сервис Экватора и его настройки отображения, предзаказов и бронирования." })
  @ApiCreatedResponse({ description: "Сервис успешно создан", type: ServiceTypeResponseDto })
  @ApiConsumes("multipart/form-data")
  @ApiBody(serviceTypeMultipartBody)
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
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) createServiceType: CreateServiceTypeDto,
    @UploadedFiles()
    files: {
      photo?: Express.Multer.File[];
      gallery?: Express.Multer.File[];
    },
  ) {
    const images = await this.convertImages(files);
    return this.serviceTypeService.create({ ...createServiceType, ...images });
  }

  @Get()
  @ApiOperation({ summary: "Получить список всех сервисов", description: "Возвращает сервисы Экватора в сохранённом порядке." })
  @ApiOkResponse({ description: "Список сервисов", type: ServiceTypeListItemResponseDto, isArray: true })
  findAll() {
    return this.serviceTypeService.findAll();
  }

  @Get("order-permission")
  @UseGuards(AuthGuard, PrivilegesGuard)
  @RequirePrivileges("services.reorder")
  @ApiOperation({ summary: "Проверить доступ к изменению порядка", description: "Служебная проверка привилегии services.reorder для изменения порядка сервисов." })
  @ApiOkResponse({ type: OrderPermissionResponseDto })
  orderPermission() { return { canReorder: true }; }

  @Put("order")
  @UseGuards(AuthGuard, PrivilegesGuard)
  @RequirePrivileges("services.reorder")
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
  @UseGuards(AuthGuard, PrivilegesGuard)
  @RequirePrivileges("services.delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Удалить сервис по ID", description: "Удаляет сервис. Операция может быть отклонена БД при наличии связанных исторических данных." })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiNoContentResponse({ description: "Сервис удален; тела ответа нет." })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.serviceTypeService.remove(id);
  }

  @Put(":id")
  @UseGuards(AuthGuard, PrivilegesGuard)
  @RequirePrivileges("services.update")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Обновить сервис по ID", description: "Обновляет данные и настройки сервиса Экватора." })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiNoContentResponse({ description: "Сервис изменен; тела ответа нет." })
  @ApiConsumes("multipart/form-data")
  @ApiBody(serviceTypeMultipartBody)
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
    @Request() request: { user: AuthenticatedUser },
    @Param("id", ParseIntPipe) id: number,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) createServiceType: CreateServiceTypeDto,
    @UploadedFiles()
    files: {
      photo?: Express.Multer.File[];
      gallery?: Express.Multer.File[];
    },
  ) {
    const images = await this.convertImages(files);
    this.serviceAccess.assertCanAccessServices(request.user, [id], "services.update");
    return this.serviceTypeService.update(id, { ...createServiceType, ...images });
  }

  private async convertImages(files?: { photo?: Express.Multer.File[]; gallery?: Express.Multer.File[] }) {
    const convert = async (file: Express.Multer.File) => {
      try {
        return (await sharp(file.buffer).webp({ quality: 80 }).toBuffer()).toString("base64");
      } catch {
        throw new BadRequestException("Файл должен содержать корректное изображение");
      }
    };
    return {
      photo: files?.photo?.[0] ? await convert(files.photo[0]) : null,
      gallery: await Promise.all((files?.gallery ?? []).map(convert)),
    };
  }
}
