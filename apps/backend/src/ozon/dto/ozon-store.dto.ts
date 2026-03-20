import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
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
