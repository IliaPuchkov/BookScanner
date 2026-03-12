import {
  IsString,
  IsOptional,
  IsNumber,
  IsEnum,
  IsArray,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaperType, CoverType } from '@bookscanner/shared';

export class UpdateBookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  author?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  isbn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publisher?: string;

  @ApiPropertyOptional()
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
