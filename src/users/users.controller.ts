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
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedUser } from "../auth/service-access.service";
import { UserRole } from "../generated/prisma/enums";
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
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Создать нового пользователя" })
  @ApiResponse({ status: 201, description: "Пользователь успешно создан" })
  create(@Request() request: { user: AuthenticatedUser }, @Body() createUserDto: CreateUserDto) {
    return this.usersService.create(request.user, createUserDto);
  }

  @Put(":id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Изменить пользователя" })
  @ApiResponse({ status: 201, description: "Пользователь успешно изменен" })
  update(
    @Request() request: { user: AuthenticatedUser },
    @Param("id", ParseIntPipe) id: number,
    @Body() updateUserDTO: UpdateUserDTO,
  ) {
    return this.usersService.update(request.user, id, updateUserDTO);
  }

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: "Получить список всех пользователей" })
  @ApiResponse({ status: 200, description: "Список пользователей" })
  findAll(@Request() request: { user: AuthenticatedUser }) {
    return this.usersService.findAll(request.user);
  }

  @Get(":id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: "Получить пользователя по ID" })
  @ApiParam({ name: "id", type: "number", description: "ID пользователя" })
  @ApiResponse({ status: 200, description: "Пользователь найден" })
  @ApiResponse({ status: 404, description: "Пользователь не найден" })
  findOne(@Request() request: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number) {
    return this.usersService.findOne(request.user, id);
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

