import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OZON_DESCRIPTION_CATEGORY_ID, OZON_TYPE_ID } from '@bookscanner/shared';

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

@Injectable()
export class OzonApiClient {
  private readonly logger = new Logger(OzonApiClient.name);
  private readonly baseUrl = 'https://api-seller.ozon.ru';
  private readonly apiKey: string;
  private readonly clientId: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OZON_API_KEY', '');
    this.clientId = this.configService.get<string>('OZON_CLIENT_ID', '');
  }

  get isConfigured(): boolean {
    return !!this.apiKey && !!this.clientId;
  }

  private async post<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    this.logger.debug(`POST ${endpoint}`);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Id': this.clientId,
        'Api-Key': this.apiKey,
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

  async importProduct(payload: Record<string, unknown>): Promise<OzonImportResult> {
    const response = await this.post<{ result: OzonImportResult }>(
      '/v3/product/import',
      payload,
    );
    return response.result;
  }

  async getImportInfo(taskId: number): Promise<OzonImportInfoItem[]> {
    const response = await this.post<{ result: { items: OzonImportInfoItem[] } }>(
      '/v1/product/import/info',
      { task_id: taskId },
    );
    return response.result.items;
  }

  async getProductInfo(productId: number): Promise<OzonProductInfo> {
    const response = await this.post<{ result: OzonProductInfo }>(
      '/v2/product/info',
      { product_id: productId },
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

    // Для авторов Ozon хранит "Фамилия Имя", пробуем оба порядка слов
    const variants = [searchValue];
    const words = searchValue.trim().split(/\s+/);
    if (words.length === 2) {
      variants.push(`${words[1]} ${words[0]}`);
    } else if (words.length === 3) {
      // "Имя Отчество Фамилия" → "Фамилия Имя Отчество"
      variants.push(`${words[2]} ${words[0]} ${words[1]}`);
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
