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
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { CreateServiceTypeDto } from "./dto/create.service-type.dto";
import { ServiceTypeService } from "./service-type.service";

@ApiTags("services")
@Controller("services")
export class ServiceTypesController {
  constructor(private readonly serviceTypeService: ServiceTypeService) {}

  @Post()
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
        photo: { type: "string", format: "binary" }, // поле для файла
      },
      required: ["name", "photo"],
    },
  })
  @UseInterceptors(FileInterceptor("photo"))
  async create(
    @Body() createServiceType: CreateServiceTypeDto,
    @UploadedFile() file: Express.Multer.File
  ) {
    const base64Photo = file.buffer.toString("base64");
    return this.serviceTypeService.create({
      ...createServiceType,
      showInMain: String(createServiceType.showInMain) === "true",
      photo: base64Photo,
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
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Удалить сервис по ID" })
  @ApiParam({ name: "id", type: "number", description: "ID сервиса" })
  @ApiResponse({ status: 204, description: "Сервис удален" })
  remove(@Param("id", ParseIntPipe) id: number) {
    return this.serviceTypeService.remove(id);
  }
}

