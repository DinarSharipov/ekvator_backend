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
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { CreateServiceElementDto } from "./dto/create.service-element.dto";
import { ServiceElementService } from "./service-element.service";

@ApiTags("service-elements")
@Controller("service-elements")
export class ServiceElementsController {
  constructor(private readonly serviceElementService: ServiceElementService) {}

  @Post()
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Создать новую услугу" })
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
      },
      required: ["name", "photos"],
    },
  })
  @UseInterceptors(FilesInterceptor("photos"))
  async create(
    @Body() createServiceElement: CreateServiceElementDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const base64Photos = files?.map((e) => e.buffer.toString("base64"));
    return this.serviceElementService.create({
      ...createServiceElement,
      price: createServiceElement.price,
      type: Number(createServiceElement.type),
      isArchive: String(createServiceElement.isArchive) === "true",
      photos: base64Photos,
      createdDate: createServiceElement.createdDate || new Date().toISOString(),
    });
  }

  @Put(":id")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Изменить услугу" })
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
      },
      required: ["name", "price"],
    },
  })
  @UseInterceptors(FilesInterceptor("photos"))
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() createServiceElement: CreateServiceElementDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const base64Photos = files?.map((e) => e.buffer.toString("base64"));
    return this.serviceElementService.update(id, {
      ...createServiceElement,
      price: createServiceElement.price,
      type: Number(createServiceElement.type),
      isArchive: String(createServiceElement.isArchive) === "true",
      photos: base64Photos,
    });
  }

  @Get()
  @ApiOperation({ summary: "Получить список всех услуг" })
  @ApiResponse({ status: 200, description: "Список услуг" })
  findAll() {
    return this.serviceElementService.findAll();
  }

  @Get("byId/:id")
  @ApiOperation({ summary: "Получить список по типу сервиса" })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiResponse({ status: 200, description: "Список услуг" })
  findAllByServiceId(@Param("id", ParseIntPipe) id: number) {
    return this.serviceElementService.findAllByServiceId(id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить услугу по ID" })
  @ApiParam({ name: "id", type: "number", description: "ID услуги" })
  @ApiResponse({ status: 200, description: "Услуга не найден" })
  @ApiResponse({ status: 404, description: "Услуга не найден" })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.serviceElementService.findOne(id);
  }

  @Delete(":id")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Удалить услугу по ID" })
  @ApiParam({ name: "id", type: "number", description: "ID услуги" })
  @ApiResponse({ status: 204, description: "Услуга удалена" })
  remove(@Param("id", ParseIntPipe) id: string) {
    return this.serviceElementService.remove(+id);
  }
}

