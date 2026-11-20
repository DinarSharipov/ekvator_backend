import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { CompanyResponseDto, CompanyTopUpResponseDto } from "../../openapi/response.dto";

class PaginationResponseDto {
  @ApiProperty({ minimum: 0 }) total: number;
  @ApiProperty({ minimum: 1 }) page: number;
  @ApiProperty({ minimum: 1, maximum: 100 }) limit: number;
}

class TopUpCompanyDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ type: String, nullable: true }) inn: string | null;
}

class AdminTopUpDto extends CompanyTopUpResponseDto {
  @ApiProperty({ type: () => TopUpCompanyDto }) company: TopUpCompanyDto;
}

export class AdminCompanyPageDto extends PaginationResponseDto {
  @ApiProperty({ type: () => CompanyResponseDto, isArray: true }) items: CompanyResponseDto[];
}

export class AdminTopUpPageDto extends PaginationResponseDto {
  @ApiProperty({ type: () => AdminTopUpDto, isArray: true }) items: AdminTopUpDto[];
}
