import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveDuplicateDto {
  @ApiProperty()
  @IsUUID()
  book1Id: string;

  @ApiProperty()
  @IsUUID()
  book2Id: string;
}
