import { IsEnum, IsNumber, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CoverType, PaperType } from '@bookscanner/shared';

export class CardDefaultsDto {
  @ApiProperty() @IsNumber() weightG: number;
  @ApiProperty() @IsNumber() widthMm: number;
  @ApiProperty() @IsNumber() lengthMm: number;
  @ApiProperty() @IsNumber() thicknessMm: number;
  @ApiProperty({ enum: PaperType }) @IsEnum(PaperType) paperType: PaperType;
  @ApiProperty({ enum: CoverType }) @IsEnum(CoverType) coverType: CoverType;
  @ApiProperty() @IsString() @MaxLength(100) language: string;
  @ApiProperty() @IsString() @MaxLength(100) condition: string;
  @ApiProperty() @IsString() @MaxLength(100) bookType: string;
  @ApiProperty() @IsString() @MaxLength(100) direction: string;
}
