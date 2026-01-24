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
} from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { memoryStorage } from "multer";
import { AuthGuard } from "../auth/auth.guard";
import { CreateServiceTypeDto } from "./dto/create.service-type.dto";
import { ServiceTypeService } from "./service-type.service";

@ApiTags("services")
@Controller("services")
export class ServiceTypesController {
  constructor(private readonly serviceTypeService: ServiceTypeService) {}

  @Post()
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Создать новый тип сервиса" })
  @ApiResponse({ status: 201, description: "Сервис успешно создан" })
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
    const base64Photo = files?.photo.buffer.toString("base64");

    const base64Gallery = files?.gallery?.map((file) =>
      file.buffer.toString("base64"),
    );
    return this.serviceTypeService.create({
      ...createServiceType,
      showInMain: String(createServiceType.showInMain) === "true",
      photo: base64Photo,
      gallery: base64Gallery,
    });
  }

  @Get()
  @ApiOperation({ summary: "Получить список всех сервисов" })
  @ApiResponse({ status: 200, description: "Список сервисов" })
  findAll() {
    return this.serviceTypeService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить сервис по ID" })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiResponse({ status: 200, description: "Сервис не найден" })
  @ApiResponse({ status: 404, description: "Сервис не найден" })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.serviceTypeService.findOne(id);
  }

  @Delete(":id")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Удалить сервис по ID" })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiResponse({ status: 204, description: "Сервис удален" })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.serviceTypeService.remove(id);
  }

  @Put(":id")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Обновить сервис по ID" })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiResponse({ status: 201, description: "Сервис изменен" })
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
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() createServiceType: CreateServiceTypeDto,
    @UploadedFiles()
    files: {
      photo?: Express.Multer.File;
      gallery?: Express.Multer.File[];
    },
  ) {
    console.log("UPD", createServiceType);

    const base64Photo = files?.photo?.buffer?.toString("base64");

    const base64Gallery = files?.gallery?.map((file) =>
      file.buffer.toString("base64"),
    );

    return this.serviceTypeService.update(id, {
      ...createServiceType,
      showInMain: String(createServiceType.showInMain) === "true",
      photo: base64Photo,
      gallery: base64Gallery,
    });
  }
}

