import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
