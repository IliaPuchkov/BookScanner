import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class IsbnLookupDto {
  @ApiProperty({ example: '978-5-17-090796-5' })
  @IsString()
  @IsNotEmpty()
  isbn: string;
}
