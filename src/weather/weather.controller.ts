import { Controller, Get, Query, ValidationPipe } from "@nestjs/common";
import { ApiBadGatewayResponse, ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { WeatherQueryDto } from "./dto/weather-query.dto";
import { WeatherErrorDto, WeatherResponseDto, WeatherValidationErrorDto } from "./dto/weather-response.dto";
import { WeatherService } from "./weather.service";

@ApiTags("weather")
@Controller("weather")
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  @Get()
  @ApiOperation({ summary: "Get a weather forecast through the server-side Open-Meteo proxy" })
  @ApiOkResponse({ type: WeatherResponseDto })
  @ApiBadRequestResponse({ description: "Invalid coordinates or UTC date range", type: WeatherValidationErrorDto })
  @ApiNotFoundResponse({ description: "Forecast is not available for the selected date", type: WeatherErrorDto })
  @ApiBadGatewayResponse({ description: "Open-Meteo is unavailable", type: WeatherErrorDto })
  forecast(@Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })) query: WeatherQueryDto) {
    return this.weather.forecast(query);
  }
}
