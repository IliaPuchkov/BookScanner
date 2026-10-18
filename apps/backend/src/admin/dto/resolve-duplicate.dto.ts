import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ResolveDuplicateDto {
  @ApiProperty()
  @IsUUID()
  book1Id: string;

  @ApiProperty()
  @IsUUID()
  book2Id: string;
}

export class ResolvePairsDto {
  @ApiProperty({ type: [ResolveDuplicateDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => ResolveDuplicateDto)
  pairs: ResolveDuplicateDto[];
}
