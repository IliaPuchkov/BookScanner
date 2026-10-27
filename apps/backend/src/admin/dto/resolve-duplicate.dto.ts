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

export class UnresolveLastDto {
  @ApiProperty()
  @IsUUID()
  bookId: string;

  @ApiProperty({ type: [String], description: 'Другие книги группы — снимаются решения только с ними' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  otherIds: string[];
}

export class MoveToCopySetDto {
  @ApiProperty({ description: 'Набор копий, в который перенести книгу' })
  @IsUUID()
  copyGroupId: string;
}

export class StartCopySetDto {
  @ApiProperty({ description: 'Книга без набора, с которой начать новый набор копий' })
  @IsUUID()
  withBookId: string;
}
