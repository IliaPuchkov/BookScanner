import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ImportOzonDto {
  @ApiProperty({ description: 'Список product_id товаров Ozon для импорта', type: [Number] })
  @IsArray()
  @IsNumber({}, { each: true })
  productIds: number[];

  @ApiPropertyOptional({ description: 'UUID магазина Ozon (если не указан — активный)' })
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ description: 'Импортировать как архивные (статус ARCHIVED вместо PUBLISHED)' })
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}
