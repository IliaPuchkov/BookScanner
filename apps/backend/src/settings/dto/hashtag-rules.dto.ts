import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HASHTAG_RULE_TYPES, type HashtagRuleType } from '../hashtag-rules';

export class HashtagRuleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  id: string;

  @ApiProperty({ enum: HASHTAG_RULE_TYPES })
  @IsIn(HASHTAG_RULE_TYPES as unknown as string[])
  type: HashtagRuleType;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ description: 'forbid: фрагмент слова; replace: какой тег заменить; add: какой тег добавить' })
  @IsString()
  @MaxLength(100)
  value: string;

  @ApiPropertyOptional({ description: 'replace: на какой тег заменить' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  replacement?: string | null;

  @ApiPropertyOptional({ description: 'add: год издания с' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(2100)
  yearFrom?: number | null;

  @ApiPropertyOptional({ description: 'add: год издания по' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(2100)
  yearTo?: number | null;
}

export class SaveHashtagRulesDto {
  @ApiProperty({ type: [HashtagRuleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HashtagRuleDto)
  rules: HashtagRuleDto[];
}

export class PreviewHashtagRulesDto {
  @ApiProperty({ type: [String], example: ['#классика', '#политика'] })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  yearPublished?: number;

  @ApiPropertyOptional({ type: [HashtagRuleDto], description: 'Несохранённые правила; без них — сохранённые' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HashtagRuleDto)
  rules?: HashtagRuleDto[];
}
