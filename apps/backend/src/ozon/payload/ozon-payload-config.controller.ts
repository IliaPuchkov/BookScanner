import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { UserRole } from '@bookscanner/shared';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { OzonService } from '../ozon.service';
import { OzonPayloadConfigService } from './ozon-payload-config.service';
import { OzonAttributeCatalogService } from './ozon-attribute-catalog.service';
import {
  DEFAULT_OZON_PAYLOAD_CONFIG,
  OZON_BUILTINS,
  OZON_CARD_FIELDS,
  OZON_COND_OPS,
  type OzonPayloadConfig,
} from './ozon-payload-config';

/** The whole config is checked by ozonPayloadConfigError (messages name the attribute). */
class SaveOzonPayloadConfigDto {
  @IsObject()
  config: OzonPayloadConfig;
}

class PreviewOzonPayloadDto {
  @IsOptional()
  @IsUUID()
  bookId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  /** An unsaved draft; without it — the saved config */
  @IsOptional()
  @IsObject()
  config?: OzonPayloadConfig;
}

@ApiTags('Ozon payload config')
@Controller('ozon/payload-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class OzonPayloadConfigController {
  constructor(
    private readonly configService: OzonPayloadConfigService,
    private readonly ozonService: OzonService,
    private readonly catalog: OzonAttributeCatalogService,
  ) {}

  @Get('ozon-categories')
  @ApiOperation({ summary: 'Поиск по дереву категорий Ozon (без запроса — ветка «Книги»), до 100 результатов' })
  ozonCategories(@Query('q') q?: string) {
    return this.catalog.searchCategories((q ?? '').slice(0, 100));
  }

  @Get('ozon-attributes')
  @ApiOperation({ summary: 'Атрибуты Ozon для категорий из настройки (для выбора в редакторе)' })
  ozonAttributes() {
    return this.catalog.listAttributes();
  }

  @Get('ozon-attributes/:id/values')
  @ApiOperation({ summary: 'Значения словаря атрибута Ozon (поиск от 2 символов)' })
  ozonAttributeValues(@Param('id', ParseIntPipe) id: number, @Query('q') q?: string) {
    return this.catalog.searchValues(id, (q ?? '').slice(0, 100));
  }

  @Get()
  @ApiOperation({ summary: 'Сборка карточки Ozon: текущая настройка, стандартная и справочники для редактора' })
  async get() {
    return {
      config: await this.configService.get(),
      standard: DEFAULT_OZON_PAYLOAD_CONFIG,
      fields: OZON_CARD_FIELDS,
      builtins: OZON_BUILTINS,
      ops: OZON_COND_OPS,
    };
  }

  @Put()
  @ApiOperation({ summary: 'Сохранить настройку сборки карточки Ozon целиком' })
  async save(@Body() dto: SaveOzonPayloadConfigDto) {
    return { config: await this.configService.save(dto.config) };
  }

  @Post('preview')
  @ApiOperation({ summary: 'Payload, который уйдёт на Ozon для книги (без отправки)' })
  preview(@Body() dto: PreviewOzonPayloadDto) {
    if (!dto.bookId && !dto.sku?.trim()) throw new BadRequestException('Укажите книгу или SKU');
    const config = dto.config ? this.configService.normalize(dto.config) : undefined;
    return this.ozonService.previewPayload({ bookId: dto.bookId, sku: dto.sku?.trim(), config });
  }
}
