import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertSettingDto {
  @ApiProperty({ example: 'max_photos' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: '10' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiPropertyOptional({ example: 'Максимальное количество фотографий' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'number', enum: ['string', 'number', 'boolean', 'json'] })
  @IsOptional()
  @IsString()
  valueType?: string;
}
