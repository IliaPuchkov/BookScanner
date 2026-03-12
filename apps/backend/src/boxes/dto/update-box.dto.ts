import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBoxDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  boxNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
