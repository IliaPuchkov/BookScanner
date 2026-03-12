import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExtractDto {
  @ApiProperty({ description: 'ID книги для распознавания' })
  @IsUUID()
  bookId: string;
}
