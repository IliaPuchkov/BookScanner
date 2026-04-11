import { IsOptional, IsString, IsUUID, IsEnum, IsDateString, IsNumberString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { BookStatus } from '@bookscanner/shared';

export class SearchBooksDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Поиск по названию, автору, ISBN' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Фильтр по коробке' })
  @IsOptional()
  @IsUUID()
  boxId?: string;

  @ApiPropertyOptional({ description: 'Фильтр по оператору' })
  @IsOptional()
  @IsUUID()
  createdById?: string;

  @ApiPropertyOptional({ description: 'Дата от (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Дата до (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Фильтр по статусу', enum: BookStatus })
  @IsOptional()
  @IsEnum(BookStatus)
  status?: BookStatus;

  @ApiPropertyOptional({ description: 'Минимальная цена' })
  @IsOptional()
  @IsNumberString()
  priceMin?: string;

  @ApiPropertyOptional({ description: 'Максимальная цена' })
  @IsOptional()
  @IsNumberString()
  priceMax?: string;

  @ApiPropertyOptional({ description: 'Год издания от' })
  @IsOptional()
  @IsNumberString()
  yearFrom?: string;

  @ApiPropertyOptional({ description: 'Год издания до' })
  @IsOptional()
  @IsNumberString()
  yearTo?: string;
}
