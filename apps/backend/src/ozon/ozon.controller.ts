import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { OzonService } from './ozon.service';
import { OzonApiClient } from './ozon-api.client';
import { PublishDto } from './dto/publish.dto';
import { BulkPublishDto } from './dto/bulk-publish.dto';
import { CreateOzonStoreDto, OzonStoreRecord, OzonStoreResponse } from './dto/ozon-store.dto';
import { SettingsService } from '../settings/settings.service';
import { EncryptionService } from '../common/encryption.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole, OZON_ATTR_BRAND, OZON_ATTR_AUTHOR } from '@bookscanner/shared';

const OZON_STORES_KEY = 'ozon_stores';
const ACTIVE_STORE_KEY = 'active_ozon_store_id';

function maskApiKey(key: string): string {
  if (!key || key.length <= 4) return '****';
  return '****' + key.slice(-4);
}

@ApiTags('Ozon')
@Controller('ozon')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class OzonController {
  constructor(
    private readonly ozonService: OzonService,
    private readonly ozonApiClient: OzonApiClient,
    private readonly settingsService: SettingsService,
    private readonly encryptionService: EncryptionService,
    private readonly configService: ConfigService,
  ) {}

  @Post('publish')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Опубликовать карточку на Ozon' })
  publish(@Body() dto: PublishDto) {
    return this.ozonService.publish(dto.bookId, dto.storeId);
  }

  @Post('publish/bulk')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Опубликовать несколько карточек на Ozon (батчами по 100)' })
  publishBulk(@Body() dto: BulkPublishDto) {
    return this.ozonService.publishBulk(dto.bookIds, dto.storeId);
  }

  @Post('check-status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Проверить статус публикации на Ozon' })
  checkStatus(@Body() dto: PublishDto) {
    return this.ozonService.checkStatus(dto.bookId);
  }

  @Get('price-lookup')
  @ApiOperation({ summary: 'Поиск средней цены на Ozon' })
  @ApiQuery({ name: 'query', description: 'ISBN, название или автор' })
  priceLookup(@Query('query') query: string) {
    return this.ozonService.priceLookup(query);
  }

  // ─── Ozon Store Management ───────────────────────────────────────────────

  @Get('stores')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Список подключённых магазинов Ozon' })
  async getStores(): Promise<{ stores: OzonStoreResponse[]; activeId: string }> {
    const stores = await this.settingsService.getValue<OzonStoreRecord[]>(OZON_STORES_KEY, []);
    const activeId = await this.settingsService.getValue<string>(ACTIVE_STORE_KEY, '');
    return {
      stores: stores.map((s) => ({
        id: s.id,
        name: s.name,
        clientId: s.clientId,
        apiKeyMasked: maskApiKey(this.encryptionService.decrypt(s.apiKey)),
        isActive: s.id === activeId,
      })),
      activeId,
    };
  }

  @Post('stores')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Добавить магазин Ozon' })
  async addStore(@Body() dto: CreateOzonStoreDto): Promise<OzonStoreResponse> {
    const stores = await this.settingsService.getValue<OzonStoreRecord[]>(OZON_STORES_KEY, []);
    const activeId = await this.settingsService.getValue<string>(ACTIVE_STORE_KEY, '');

    const newStore: OzonStoreRecord = {
      id: randomUUID(),
      name: dto.name,
      clientId: dto.clientId,
      apiKey: this.encryptionService.encrypt(dto.apiKey),
    };
    stores.push(newStore);

    await this.settingsService.upsert({
      key: OZON_STORES_KEY,
      value: JSON.stringify(stores),
      valueType: 'json',
      description: 'Список подключённых магазинов Ozon',
    });

    return {
      id: newStore.id,
      name: newStore.name,
      clientId: newStore.clientId,
      apiKeyMasked: maskApiKey(dto.apiKey),
      isActive: newStore.id === activeId,
    };
  }

  @Get('stores/:id/limits')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Лимиты магазина Ozon' })
  async getStoreLimits(@Param('id') id: string) {
    const stores = await this.settingsService.getValue<OzonStoreRecord[]>(OZON_STORES_KEY, []);
    if (!stores.find((s) => s.id === id)) {
      throw new BadRequestException('Магазин не найден');
    }
    return this.ozonApiClient.getProductLimits(id);
  }

  @Get('stores/:id/key-expiry')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Дата истечения ключа API магазина Ozon' })
  async getStoreKeyExpiry(@Param('id') id: string) {
    const stores = await this.settingsService.getValue<OzonStoreRecord[]>(OZON_STORES_KEY, []);
    if (!stores.find((s) => s.id === id)) {
      throw new BadRequestException('Магазин не найден');
    }
    const expiresAt = await this.ozonApiClient.getApiKeyExpiry(id);
    return { expiresAt };
  }

  @Delete('stores/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Удалить магазин Ozon' })
  async removeStore(@Param('id') id: string): Promise<{ success: boolean }> {
    const stores = await this.settingsService.getValue<OzonStoreRecord[]>(OZON_STORES_KEY, []);
    const updated = stores.filter((s) => s.id !== id);

    await this.settingsService.upsert({
      key: OZON_STORES_KEY,
      value: JSON.stringify(updated),
      valueType: 'json',
      description: 'Список подключённых магазинов Ozon',
    });

    const activeId = await this.settingsService.getValue<string>(ACTIVE_STORE_KEY, '');
    if (activeId === id) {
      await this.settingsService.upsert({
        key: ACTIVE_STORE_KEY,
        value: '',
        valueType: 'string',
        description: 'ID активного магазина Ozon',
      });
    }

    return { success: true };
  }

  @Patch('stores/:id/activate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Выбрать активный магазин Ozon' })
  async activateStore(@Param('id') id: string): Promise<{ activeId: string }> {
    const stores = await this.settingsService.getValue<OzonStoreRecord[]>(OZON_STORES_KEY, []);
    if (!stores.find((s) => s.id === id)) {
      throw new BadRequestException('Магазин не найден');
    }

    await this.settingsService.upsert({
      key: ACTIVE_STORE_KEY,
      value: id,
      valueType: 'string',
      description: 'ID активного магазина Ozon',
    });

    return { activeId: id };
  }

  // ─── Debug (development only) ──────────────────────────────────────────

  @Get('debug/dictionary')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'DEBUG: поиск значения в словаре Ozon' })
  @ApiQuery({ name: 'value', description: 'Искомое значение' })
  @ApiQuery({ name: 'attr', description: 'brand | author', required: false })
  async debugDictionary(
    @Query('value') value: string,
    @Query('attr') attr: 'brand' | 'author' = 'brand',
  ) {
    this.ensureNotProduction();
    const attributeId = attr === 'author' ? OZON_ATTR_AUTHOR : OZON_ATTR_BRAND;
    const id = await this.ozonApiClient.findDictionaryValue(attributeId, value);
    return { attributeId, searchValue: value, foundId: id ?? null };
  }

  @Get('debug/dictionary-raw')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'DEBUG: сырой ответ словаря Ozon (первые 10 значений)' })
  @ApiQuery({ name: 'attr', description: 'brand | author', required: false })
  @ApiQuery({ name: 'value', description: 'Фильтр value (опционально)', required: false })
  async debugDictionaryRaw(
    @Query('attr') attr: 'brand' | 'author' = 'brand',
    @Query('value') value?: string,
  ) {
    this.ensureNotProduction();
    const attributeId = attr === 'author' ? OZON_ATTR_AUTHOR : OZON_ATTR_BRAND;
    return this.ozonApiClient.fetchDictionaryRaw(attributeId, value);
  }

  private ensureNotProduction() {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new BadRequestException('Debug endpoints are disabled in production');
    }
  }
}
