import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AdminGuard } from "../auth/admin.guard";
import { AuthGuard } from "../auth/auth.guard";
import { PrivilegesGuard, RequirePrivileges } from "../auth/privileges.guard";
import { ApiErrorDto } from "../openapi/response.dto";
import { AccessRolesService } from "./access-roles.service";
import {
  AccessRoleResponseDto,
  AssignAccessRolesDto,
  PrivilegeDefinitionDto,
  SaveAccessRoleDto,
} from "./dto/access-role.dto";

@ApiTags("access-roles")
@ApiBearerAuth()
@Controller("admin")
@UseGuards(AuthGuard, AdminGuard, PrivilegesGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
@ApiResponse({ status: 400, type: ApiErrorDto })
@ApiResponse({ status: 401, type: ApiErrorDto })
@ApiResponse({ status: 403, type: ApiErrorDto })
@ApiResponse({ status: 404, type: ApiErrorDto })
@ApiResponse({ status: 409, type: ApiErrorDto })
export class AccessRolesController {
  constructor(private readonly roles: AccessRolesService) {}

  @Get("privileges")
  @RequirePrivileges("roles.read")
  @ApiOperation({
    summary: "Каталог привилегий",
    description:
      "adminOnly-привилегии принадлежат только системному администратору и не делегируются.",
  })
  @ApiOkResponse({ type: PrivilegeDefinitionDto, isArray: true })
  definitions() {
    return this.roles.definitions();
  }

  @Get("roles")
  @RequirePrivileges("roles.read")
  @ApiOkResponse({ type: AccessRoleResponseDto, isArray: true })
  list() {
    return this.roles.list();
  }

  @Get("roles/:id")
  @RequirePrivileges("roles.read")
  @ApiOkResponse({ type: AccessRoleResponseDto })
  get(@Param("id", ParseIntPipe) id: number) {
    return this.roles.get(id);
  }

  @Post("roles")
  @RequirePrivileges("roles.create")
  @ApiCreatedResponse({ type: AccessRoleResponseDto })
  create(
    @Request() req: { user: { id: number } },
    @Body() dto: SaveAccessRoleDto,
  ) {
    return this.roles.create(req.user.id, dto);
  }

  @Put("roles/:id")
  @RequirePrivileges("roles.update")
  @ApiOkResponse({ type: AccessRoleResponseDto })
  update(
    @Request() req: { user: { id: number } },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: SaveAccessRoleDto,
  ) {
    return this.roles.update(req.user.id, id, dto);
  }

  @Delete("roles/:id")
  @RequirePrivileges("roles.delete")
  @HttpCode(204)
  @ApiNoContentResponse()
  delete(
    @Request() req: { user: { id: number } },
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.roles.delete(req.user.id, id);
  }

  @Put("users/:id/roles")
  @RequirePrivileges("roles.assign")
  @HttpCode(204)
  @ApiNoContentResponse()
  async assign(
    @Request() req: { user: { id: number } },
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AssignAccessRolesDto,
  ) {
    await this.roles.assign(req.user.id, id, dto);
  }
}
