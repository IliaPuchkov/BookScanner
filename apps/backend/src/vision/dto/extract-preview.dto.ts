import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ExtractPreviewDto {
  @ApiProperty({ description: 'ID книги для предварительного распознавания' })
  @IsUUID()
  bookId: string;
}
