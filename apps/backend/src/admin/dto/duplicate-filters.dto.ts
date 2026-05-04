import { IsOptional, IsIn, IsInt, Min, Max, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class DuplicateFiltersDto extends PaginationDto {
  /** Hard-cap limit at 50 — loading 700 groups with full relations causes OOM */
  @ApiPropertyOptional({ maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  declare limit: number;

  @ApiPropertyOptional({ description: 'Поиск по названию или автору' })
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ enum: ['published', 'not_published'] })
  @IsOptional()
  @IsIn(['published', 'not_published'])
  status?: 'published' | 'not_published';

  /** 2 | 3 | 4 (означает «4 и более») */
  @ApiPropertyOptional({ description: 'Количество книг в группе: 2, 3, или 4 (= 4+)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  count?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  operatorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  boxId?: string;
}
