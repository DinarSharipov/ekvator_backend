import { PrivilegesGuard, RequirePrivileges } from "../auth/privileges.guard";
import { Body, Controller, Get, Put, UseGuards, ValidationPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuthGuard } from "../auth/auth.guard";
import { ApiErrorDto } from "../openapi/response.dto";
import { SiteContactsDto, SiteContactsResponseDto } from "./dto/site-contacts.dto";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get("settings/contacts")
  @ApiOperation({ summary: "Read public site contacts", description: "Returns 404 until configured. Contains only public business details." })
  @ApiOkResponse({ type: SiteContactsResponseDto })
  @ApiResponse({ status: 404, type: ApiErrorDto })
  contacts() { return this.settings.contacts(); }

  @Put("admin/settings/contacts")
  @UseGuards(AuthGuard, PrivilegesGuard)
@RequirePrivileges("settings.update")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Replace public site contacts", description: "Administrator only. Required fields replace the complete settings; omitted email/mapUrl become null." })
  @ApiOkResponse({ type: SiteContactsResponseDto })
  @ApiResponse({ status: 400, type: ApiErrorDto })
  @ApiResponse({ status: 401, type: ApiErrorDto })
  @ApiResponse({ status: 403, type: ApiErrorDto })
  replaceContacts(@Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) dto: SiteContactsDto) {
    return this.settings.replaceContacts(dto);
  }
}
