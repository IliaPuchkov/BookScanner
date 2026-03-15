import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

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
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Дата до (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  dateTo?: string;
}
