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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AdminGuard } from "../auth/admin.guard";
import { AuthGuard } from "../auth/auth.guard";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDTO } from "./dto/update-user.dto";
import { UsersService } from "./users.service";

@ApiTags("users")
@Controller("users")
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @UseGuards(AuthGuard, AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Создать нового пользователя" })
  @ApiResponse({ status: 201, description: "Пользователь успешно создан" })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Put(":id")
  @UseGuards(AuthGuard, AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Изменить пользователя" })
  @ApiResponse({ status: 201, description: "Пользователь успешно изменен" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() updateUserDTO: UpdateUserDTO,
  ) {
    return this.usersService.update(id, updateUserDTO);
  }

  @Get()
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: "Получить список всех пользователей" })
  @ApiResponse({ status: 200, description: "Список пользователей" })
  findAll() {
    return this.usersService.findAll();
  }

  @Get(":id")
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: "Получить пользователя по ID" })
  @ApiParam({ name: "id", type: "number", description: "ID пользователя" })
  @ApiResponse({ status: 200, description: "Пользователь найден" })
  @ApiResponse({ status: 404, description: "Пользователь не найден" })
  findOne(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  @Delete(":id")
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: "Получить пользователя по ID" })
  @ApiParam({ name: "id", type: "number", description: "ID пользователя" })
  @ApiResponse({ status: 200, description: "Пользователь удален" })
  delete(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.delete(id);
  }
}

