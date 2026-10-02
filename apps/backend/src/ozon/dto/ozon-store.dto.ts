import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsArray,
  ArrayNotEmpty,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOzonStoreDto {
  @ApiProperty({ description: 'Название магазина' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'Client-Id из Seller API' })
  @IsString()
  @IsNotEmpty()
  clientId: string;

  @ApiProperty({ description: 'Api-Key из Seller API' })
  @IsString()
  @IsNotEmpty()
  apiKey: string;
}

export class ImportOzonStoresDto {
  @ApiProperty({
    type: [CreateOzonStoreDto],
    description:
      'Магазины для импорта. Если Client-Id уже подключён — обновляются название и Api-Key',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateOzonStoreDto)
  stores: CreateOzonStoreDto[];
}

export interface ImportOzonStoresResponse {
  added: number;
  updated: number;
  stores: OzonStoreResponse[];
}

export interface OzonStoreRecord {
  id: string;
  name: string;
  clientId: string;
  apiKey: string;
}

export interface OzonStoreResponse {
  id: string;
  name: string;
  clientId: string;
  apiKeyMasked: string;
  isActive: boolean;
}
