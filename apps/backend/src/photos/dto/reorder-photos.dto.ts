import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderPhotosDto {
  @ApiProperty({ type: [String], description: 'Упорядоченный массив ID фотографий' })
  @IsArray()
  @IsUUID('4', { each: true })
  photoIds: string[];
}
