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
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CreateUserDto } from "./dto/create-user.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Создать нового пользователя" })
  @ApiResponse({ status: 201, description: "Пользователь успешно создан" })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: "Получить список всех пользователей" })
  @ApiResponse({ status: 200, description: "Список пользователей" })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Получить пользователя по ID" })
  @ApiParam({ name: "id", type: "number", description: "ID пользователя" })
  @ApiResponse({ status: 200, description: "Пользователь найден" })
  @ApiResponse({ status: 404, description: "Пользователь не найден" })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Получить пользователя по ID" })
  @ApiParam({ name: "id", type: "number", description: "ID пользователя" })
  @ApiResponse({ status: 200, description: "Пользователь удален" })
  delete(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.delete(id);
  }
}

