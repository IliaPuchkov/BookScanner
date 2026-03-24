import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublishDto {
  @ApiProperty({ description: 'ID книги для публикации' })
  @IsUUID()
  bookId: string;

  @ApiPropertyOptional({ description: 'ID магазина Ozon (если не указан — используется активный)' })
  @IsOptional()
  @IsString()
  storeId?: string;
}
