import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ExportPeriodDto {
  @ApiPropertyOptional({ description: 'Начало периода (ISO, включительно)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Конец периода (ISO, не включительно)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: ['created', 'published', 'updated'],
    description: 'По какой дате отбирать: создание карточки, публикация на Ozon, последнее изменение',
  })
  @IsOptional()
  @IsIn(['created', 'published', 'updated'])
  dateField?: 'created' | 'published' | 'updated';
}

export class CreateExportDto extends ExportPeriodDto {
  @ApiProperty({ type: [String], description: 'Ключи полей из GET /admin/export/fields' })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  fields: string[];

  @ApiPropertyOptional({ type: [String], description: 'Дополнительные листы: operators, stores, days' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  sheets?: string[];

  @ApiPropertyOptional({ description: 'Date.getTimezoneOffset() телефона, минуты (Москва: -180)' })
  @IsOptional()
  @IsInt()
  @Min(-840)
  @Max(840)
  tzOffset?: number;
}
