import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsEnum,
  IsUUID,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaperType, CoverType } from '@bookscanner/shared';

export class CreateBookDto {
  @ApiProperty({ example: 'Мастер и Маргарита' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'ID коробки' })
  @IsUUID()
  boxId: string;

  @ApiPropertyOptional({ example: 'Булгаков М.А.' })
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional({ example: '978-5-17-090796-5' })
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiPropertyOptional({ example: 'АСТ' })
  @IsOptional()
  @IsString()
  publisher?: string;

  @ApiPropertyOptional({ example: 2005 })
  @IsOptional()
  @IsNumber()
  yearPublished?: number;

  @ApiPropertyOptional()
  @IsOptional()
  dimensions?: { width: number; height: number; depth: number };

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weightGross?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weightNet?: number;

  @ApiPropertyOptional({ enum: PaperType })
  @IsOptional()
  @IsEnum(PaperType)
  paperType?: PaperType;

  @ApiPropertyOptional({ enum: CoverType })
  @IsOptional()
  @IsEnum(CoverType)
  coverType?: CoverType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pageCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  annotation?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hashtags?: string[];
}
