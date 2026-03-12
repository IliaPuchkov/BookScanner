import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PublishDto {
  @ApiProperty({ description: 'ID книги для публикации' })
  @IsUUID()
  bookId: string;
}
