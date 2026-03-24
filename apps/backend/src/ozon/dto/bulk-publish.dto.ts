import { IsArray, IsUUID, IsOptional, IsString, ArrayMinSize } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkPublishDto {
  @ApiProperty({ type: [String], description: 'ID книг для публикации' })
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayMinSize(1)
  bookIds: string[];

  @ApiPropertyOptional({ description: 'ID магазина Ozon (если не указан — используется активный)' })
  @IsOptional()
  @IsString()
  storeId?: string;
}
