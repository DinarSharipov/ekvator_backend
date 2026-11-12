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
import { ApiCreatedResponse, ApiExtraModels, ApiNoContentResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { AdminGuard } from "../auth/admin.guard";
import { Roles } from "../auth/roles.decorator";
import { RolesGuard } from "../auth/roles.guard";
import { AuthenticatedUser } from "../auth/service-access.service";
import { UserRole } from "../generated/prisma/enums";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDTO } from "./dto/update-user.dto";
import { UsersService } from "./users.service";
import { ApiErrorDto, UserResponseDto } from "../openapi/response.dto";

@ApiTags("users")
@Controller("users")
@ApiExtraModels(ApiErrorDto, UserResponseDto)
@ApiResponse({ status: 400, description: "Некорректные параметры или тело запроса", type: ApiErrorDto })
@ApiResponse({ status: 401, description: "Требуется Bearer JWT", type: ApiErrorDto })
@ApiResponse({ status: 403, description: "Недостаточно прав", type: ApiErrorDto })
@ApiResponse({ status: 404, description: "Пользователь или сервис не найден", type: ApiErrorDto })
@ApiResponse({ status: 409, description: "Логин или телефон уже используется", type: ApiErrorDto })
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
  @ApiOperation({ summary: "Создать нового пользователя", description: "Администратор создаёт любую роль; менеджер может создавать только сотрудников своих сервисов." })
  @ApiCreatedResponse({ description: "Пользователь успешно создан", type: UserResponseDto })
  create(@Request() request: { user: AuthenticatedUser }, @Body() createUserDto: CreateUserDto) {
    return this.usersService.create(request.user, createUserDto);
  }

  @Put(":id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Изменить пользователя", description: "Изменяет профиль, роль и назначения с проверкой полномочий текущего пользователя." })
  @ApiCreatedResponse({ description: "Пользователь успешно изменен", type: UserResponseDto })
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
  @ApiOperation({ summary: "Получить список всех пользователей", description: "Администратор видит всех пользователей; менеджер — только сотрудников своих сервисов." })
  @ApiOkResponse({ description: "Список пользователей", type: UserResponseDto, isArray: true })
  findAll(@Request() request: { user: AuthenticatedUser }) {
    return this.usersService.findAll(request.user);
  }

  @Get(":id")
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager)
  @ApiOperation({ summary: "Получить пользователя по ID", description: "Возвращает доступный текущему пользователю профиль." })
  @ApiParam({ name: "id", type: "number", description: "ID пользователя" })
  @ApiOkResponse({ description: "Пользователь найден", type: UserResponseDto })
  @ApiNotFoundResponse({ description: "Пользователь не найден", type: ApiErrorDto })
  findOne(@Request() request: { user: AuthenticatedUser }, @Param("id", ParseIntPipe) id: number) {
    return this.usersService.findOne(request.user, id);
  }

  @Delete(":id")
  @UseGuards(AuthGuard, AdminGuard)
  @ApiOperation({ summary: "Удалить пользователя", description: "Безвозвратно удаляет пользователя. Доступно только системному администратору." })
  @ApiParam({ name: "id", type: "number", description: "ID пользователя" })
  @ApiNoContentResponse({ description: "Пользователь удален; тела ответа нет." })
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param("id", ParseIntPipe) id: number) {
    return this.usersService.delete(id);
  }
}

