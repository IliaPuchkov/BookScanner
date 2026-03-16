import { IsOptional, IsString, IsUUID, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { BookStatus } from '@bookscanner/shared';

export class GetBooksQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Фильтр по коробке' })
  @IsOptional()
  @IsUUID()
  boxId?: string;

  @ApiPropertyOptional({ description: 'Поиск по названию, автору, ISBN' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Фильтр по рабочей сессии' })
  @IsOptional()
  @IsUUID()
  workSessionId?: string;

  @ApiPropertyOptional({ description: 'Фильтр по статусу', enum: BookStatus })
  @IsOptional()
  @IsEnum(BookStatus)
  status?: BookStatus;
}
