import { IsOptional, IsIn, IsInt, Min, Max, IsUUID, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

// Query strings arrive as 'true'/'false'
const toBool = ({ value }: { value: unknown }) => (value === undefined ? undefined : value === true || value === 'true');

export class DuplicateFiltersDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['isbn', 'exact', 'fuzzy'],
    description: 'isbn — одинаковый ISBN; exact — автор + название точно; fuzzy — автор + похожее название',
  })
  @IsOptional()
  @IsIn(['isbn', 'exact', 'fuzzy'])
  criterion?: 'isbn' | 'exact' | 'fuzzy';

  @ApiPropertyOptional({ description: 'Не сводить книги с разными валидными ISBN (по умолчанию true; не для isbn)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  respectIsbn?: boolean;

  @ApiPropertyOptional({
    description: 'Группировать книги без автора (пусто, «Не указан») между собой (по умолчанию false; не для isbn)',
  })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  includeUnknownAuthor?: boolean;

  @ApiPropertyOptional({ description: 'Показывать и полностью разобранные группы' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  showResolved?: boolean;

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

  @ApiPropertyOptional({ enum: ['published', 'not_published', 'archived'] })
  @IsOptional()
  @IsIn(['published', 'not_published', 'archived'])
  status?: 'published' | 'not_published' | 'archived';

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
