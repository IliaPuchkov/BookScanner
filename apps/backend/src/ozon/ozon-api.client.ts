import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { EncryptionService } from '../common/encryption.service';
import { OZON_DESCRIPTION_CATEGORY_ID, OZON_TYPE_ID } from '@bookscanner/shared';
import type { OzonStoreRecord } from './dto/ozon-store.dto';

const OZON_STORES_KEY = 'ozon_stores';
const ACTIVE_STORE_KEY = 'active_ozon_store_id';

export interface OzonProductLimits {
  daily_create: { limit: number; reset_at: string; usage: number };
  daily_update: { limit: number; reset_at: string; usage: number };
  total: { limit: number; usage: number };
}

export interface OzonImportResult {
  task_id: number;
}

export interface OzonImportInfoItem {
  offer_id: string;
  product_id: number;
  status: string; // 'pending' | 'imported' | 'failed'
  errors: Array<{ code: string; message: string }>;
}

export interface OzonProductInfoStatus {
  state: string;
  state_failed: string;
  moderate_status: string;
  state_name: string;
  state_description: string;
  is_failed: boolean;
  state_tooltip: string;
}

export interface OzonProductInfo {
  id: number;
  offer_id: string;
  name: string;
  status: OzonProductInfoStatus;
}

export interface OzonProductListItem {
  product_id: number;
  offer_id: string;
  name: string;
}

export interface OzonProductArchiveInfo {
  id: number;
  offer_id: string;
  is_archived: boolean;
  is_autoarchived: boolean;
}

export interface OzonProductAttribute {
  id: number;
  complex_id: number;
  values: Array<{ dictionary_value_id: number; value: string }>;
}

export interface OzonProductPriceItem {
  offer_id: string;
  product_id: number;
  price: {
    price: number;
    old_price: number;
    marketing_seller_price: number;
    min_price: number;
    currency_code: string;
  };
}

export interface OzonProductAttributes {
  id: number;
  offer_id: string;
  name: string;
  height: number;
  depth: number;
  width: number;
  dimension_unit: string;
  weight: number;
  weight_unit: string;
  primary_image: string;
  images: string[];
  attributes: OzonProductAttribute[];
}

@Injectable()
export class OzonApiClient {
  private readonly logger = new Logger(OzonApiClient.name);
  private readonly baseUrl = 'https://api-seller.ozon.ru';
  private readonly envApiKey: string;
  private readonly envClientId: string;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly settingsService?: SettingsService,
    @Optional() private readonly encryptionService?: EncryptionService,
  ) {
    this.envApiKey = this.configService.get<string>('OZON_API_KEY', '');
    this.envClientId = this.configService.get<string>('OZON_CLIENT_ID', '');
  }

  async getCredentials(): Promise<{ apiKey: string; clientId: string } | null> {
    if (this.settingsService) {
      try {
        const activeId = await this.settingsService.getValue<string>(ACTIVE_STORE_KEY, '');
        if (activeId) {
          const stores = await this.settingsService.getValue<OzonStoreRecord[]>(OZON_STORES_KEY, []);
          const store = stores.find((s) => s.id === activeId);
          if (store?.apiKey && store?.clientId) {
            const apiKey = this.encryptionService
              ? this.encryptionService.decrypt(store.apiKey)
              : store.apiKey;
            return { apiKey, clientId: store.clientId };
          }
        }
      } catch {
        // fall through to env vars
      }
    }

    if (this.envApiKey && this.envClientId) {
      return { apiKey: this.envApiKey, clientId: this.envClientId };
    }

    return null;
  }

  async getCredentialsForStore(storeId: string): Promise<{ apiKey: string; clientId: string } | null> {
    if (this.settingsService && this.encryptionService) {
      try {
        const stores = await this.settingsService.getValue<OzonStoreRecord[]>(OZON_STORES_KEY, []);
        const store = stores.find((s) => s.id === storeId);
        if (store?.apiKey && store?.clientId) {
          return { apiKey: this.encryptionService.decrypt(store.apiKey), clientId: store.clientId };
        }
      } catch {
        // fall through
      }
    }
    return null;
  }

  private async post<T>(
    endpoint: string,
    body: Record<string, unknown>,
    overrideCredentials?: { apiKey: string; clientId: string } | null,
  ): Promise<T> {
    const credentials = overrideCredentials !== undefined
      ? overrideCredentials
      : await this.getCredentials();
    if (!credentials) {
      throw new OzonApiError('Ozon API не настроен', 0, '');
    }

    const url = `${this.baseUrl}${endpoint}`;
    this.logger.debug(`POST ${endpoint}`);

    await this.throttle();

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Id': credentials.clientId,
        'Api-Key': credentials.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      this.logger.error(`Ozon API ${endpoint} returned ${res.status}: ${text}`);
      throw new OzonApiError(
        `Ozon API error (${res.status}): ${text}`,
        res.status,
        text,
      );
    }

    return res.json() as Promise<T>;
  }

  async importProduct(payload: Record<string, unknown>, storeId?: string): Promise<OzonImportResult> {
    const credentials = storeId
      ? await this.getCredentialsForStore(storeId)
      : await this.getCredentials();
    const response = await this.post<{ result: OzonImportResult }>(
      '/v3/product/import',
      payload,
      credentials,
    );
    return response.result;
  }

  async getApiKeyExpiry(storeId?: string): Promise<string | null> {
    const credentials = storeId
      ? await this.getCredentialsForStore(storeId)
      : await this.getCredentials();
    const response = await this.post<{ expires_at: string }>('/v1/roles', {}, credentials);
    return response.expires_at ?? null;
  }

  async getProductLimits(storeId?: string): Promise<OzonProductLimits> {
    const credentials = storeId
      ? await this.getCredentialsForStore(storeId)
      : await this.getCredentials();
    return this.post<OzonProductLimits>('/v4/product/info/limit', {}, credentials);
  }

  async getImportInfo(taskId: number): Promise<OzonImportInfoItem[]> {
    const response = await this.post<{ result: { items: OzonImportInfoItem[] } }>(
      '/v1/product/import/info',
      { task_id: taskId },
    );
    return response.result.items;
  }

  async getAllStores(): Promise<Array<{ id: string; name: string }>> {
    if (!this.settingsService) return [];
    try {
      const stores = await this.settingsService.getValue<OzonStoreRecord[]>(OZON_STORES_KEY, []);
      return (stores ?? []).map((s) => ({ id: s.id, name: s.name }));
    } catch {
      return [];
    }
  }

  async getProductList(
    storeId?: string,
    lastId = '',
    limit = 100,
    visibility?: string,
  ): Promise<{ items: OzonProductListItem[]; last_id: string; total: number }> {
    const credentials = storeId
      ? await this.getCredentialsForStore(storeId)
      : await this.getCredentials();
    const response = await this.post<{
      result: { items: OzonProductListItem[]; last_id: string; total: number };
    }>(
      '/v3/product/list',
      { filter: visibility ? { visibility } : {}, last_id: lastId, limit },
      credentials,
    );
    return response.result;
  }

  async getProductInfoList(
    productIds: number[],
    storeId?: string,
  ): Promise<OzonProductArchiveInfo[]> {
    const credentials = storeId
      ? await this.getCredentialsForStore(storeId)
      : await this.getCredentials();
    const response = await this.post<{
      result: { items: OzonProductArchiveInfo[] };
    }>(
      '/v3/product/info/list',
      { product_id: productIds },
      credentials,
    );
    return response.result?.items ?? [];
  }

  async findProductByOfferId(
    offerId: string,
    storeId?: string,
  ): Promise<OzonProductListItem | null> {
    const credentials = storeId
      ? await this.getCredentialsForStore(storeId)
      : await this.getCredentials();
    const response = await this.post<{
      result: { items: OzonProductListItem[]; total: number };
    }>(
      '/v3/product/list',
      { filter: { offer_id: [offerId], visibility: 'ALL' }, last_id: '', limit: 1 },
      credentials,
    );
    return response.result.items?.[0] ?? null;
  }

  async getProductAttributesList(
    productIds: number[],
    storeId?: string,
  ): Promise<OzonProductAttributes[]> {
    const credentials = storeId
      ? await this.getCredentialsForStore(storeId)
      : await this.getCredentials();
    const response = await this.post<{ result: OzonProductAttributes[] }>(
      '/v4/product/info/attributes',
      {
        filter: { product_id: productIds.map(String), visibility: 'ALL' },
        limit: productIds.length,
        sort_by: 'id',
        sort_dir: 'ASC',
      },
      credentials,
    );
    return response.result ?? [];
  }

  async getProductPrices(
    offerIds: string[],
    storeId?: string,
  ): Promise<Map<string, number>> {
    const credentials = storeId
      ? await this.getCredentialsForStore(storeId)
      : await this.getCredentials();

    const priceMap = new Map<string, number>();
    let cursor = '';

    do {
      const response = await this.post<{
        cursor: string;
        items: OzonProductPriceItem[];
        total: number;
      }>(
        '/v5/product/info/prices',
        {
          cursor,
          filter: { offer_id: offerIds, visibility: 'ALL' },
          limit: 1000,
        },
        credentials,
      );

      for (const item of response.items ?? []) {
        const price = item.price?.price ?? item.price?.marketing_seller_price ?? 0;
        if (price > 0) {
          priceMap.set(item.offer_id, price);
        }
      }

      cursor = response.cursor ?? '';
      // Stop if we got all items or no cursor to continue
      if (!cursor || (response.items ?? []).length < 1000) break;
    } while (true);

    return priceMap;
  }

  async getProductInfo(productId: number, offerId?: string): Promise<OzonProductInfo> {
    const body: Record<string, unknown> = offerId
      ? { offer_id: offerId }
      : { product_id: productId };
    const response = await this.post<{ result: OzonProductInfo }>(
      '/v2/product/info',
      body,
    );
    return response.result;
  }

  async fetchDictionaryRaw(
    attributeId: number,
    filterValue?: string,
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      attribute_id: attributeId,
      description_category_id: OZON_DESCRIPTION_CATEGORY_ID,
      type_id: OZON_TYPE_ID,
      language: 'DEFAULT',
      last_value_id: 0,
      limit: 10,
    };
    if (filterValue) body['value'] = filterValue;

    try {
      return await this.post('/v1/description-category/attribute/values', body);
    } catch (error) {
      return {
        error: true,
        message: error instanceof Error ? error.message : String(error),
        responseBody: error instanceof OzonApiError ? error.responseBody : undefined,
        requestBody: body,
      };
    }
  }

  // Rate limiter: не более 1 запроса каждые 300ms (Ozon limit ~3 req/sec)
  private lastRequestTime = 0;
  private readonly minRequestInterval = 300;

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = this.minRequestInterval - (now - this.lastRequestTime);
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    this.lastRequestTime = Date.now();
  }

  // Кэш: `${attributeId}:${normalizedValue}` → dictionary_value_id (или null если не найдено)
  private readonly dictCache = new Map<string, number | null>();

  private normalize(s: string): string {
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  async findDictionaryValue(
    attributeId: number,
    searchValue: string,
  ): Promise<number | undefined> {
    const needle = this.normalize(searchValue);
    const cacheKey = `${attributeId}:${needle}`;

    if (this.dictCache.has(cacheKey)) {
      return this.dictCache.get(cacheKey) ?? undefined;
    }

    // Для авторов Ozon хранит "Фамилия Имя" или "Фамилия И.", пробуем несколько вариантов
    const variants = [searchValue];
    const words = searchValue.trim().split(/\s+/);
    if (words.length === 2) {
      variants.push(`${words[1]} ${words[0]}`);              // "Воронин Андрей"
      variants.push(`${words[1]} ${words[0][0]}.`);          // "Воронин А."
      variants.push(`${words[0]} ${words[1][0]}.`);          // "Андрей В." (на случай другого порядка)
    } else if (words.length === 3) {
      // "Имя Отчество Фамилия" → "Фамилия Имя Отчество"
      variants.push(`${words[2]} ${words[0]} ${words[1]}`);
      variants.push(`${words[2]} ${words[0][0]}.`);          // "Фамилия И."
    }

    for (const variant of variants) {
      try {
        const response = await this.post<{
          result: Array<{ id: number; value: string }>;
        }>('/v1/description-category/attribute/values/search', {
          attribute_id: attributeId,
          description_category_id: OZON_DESCRIPTION_CATEGORY_ID,
          type_id: OZON_TYPE_ID,
          limit: 100,
          value: variant,
        });

        const items = response.result ?? [];
        const variantNeedle = this.normalize(variant);

        let partialMatch: number | undefined;
        for (const item of items) {
          const norm = this.normalize(item.value);
          if (norm === needle || norm === variantNeedle) {
            this.dictCache.set(cacheKey, item.id);
            return item.id;
          }
          if (!partialMatch && (norm.includes(needle) || norm.includes(variantNeedle))) {
            partialMatch = item.id;
          }
        }

        if (partialMatch) {
          this.dictCache.set(cacheKey, partialMatch);
          return partialMatch;
        }
      } catch (error) {
        this.logger.warn(
          `Dictionary lookup failed for attribute ${attributeId} / "${variant}": ${error}`,
        );
      }
    }

    this.dictCache.set(cacheKey, null);
    return undefined;
  }
}

export class OzonApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    super(message);
    this.name = 'OzonApiError';
  }
}
