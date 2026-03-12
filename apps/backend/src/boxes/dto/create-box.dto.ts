import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBoxDto {
  @ApiProperty({ example: 'BOX-001' })
  @IsString()
  @IsNotEmpty()
  boxNumber: string;

  @ApiPropertyOptional({ example: 'Коробка с детективами' })
  @IsOptional()
  @IsString()
  description?: string;
}
