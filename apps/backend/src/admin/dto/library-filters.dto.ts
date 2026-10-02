import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class LibraryFiltersDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Только библиотека этого администратора' })
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @ApiPropertyOptional({ description: 'Поиск по названию, автору или ISBN' })
  @IsOptional()
  @IsString()
  search?: string;
}
