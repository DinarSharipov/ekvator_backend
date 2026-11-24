import { Controller, Get, Header, Query, ValidationPipe } from "@nestjs/common";
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from "@nestjs/swagger";
import { M7NewsQueryDto, M7NewsResponseDto } from "./news.dto";
import { NewsService } from "./news.service";

@ApiTags("news")
@Controller("news")
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get("m7")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Russian M-7 Volga news from the shared background cache", description: "Public. Never fetches upstream on visitor requests. seendate is discovery time. Stale responses preserve the last successful fetchedAt." })
  @ApiOkResponse({ type: M7NewsResponseDto })
  @ApiBadRequestResponse({ description: "Unknown category, period or query parameter" })
  @ApiServiceUnavailableResponse({ description: "No successful cached result yet" })
  get(@Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) query: M7NewsQueryDto) {
    return this.news.read(query);
  }
}
