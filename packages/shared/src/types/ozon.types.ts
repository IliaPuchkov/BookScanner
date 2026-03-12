export interface IOzonProduct {
  id: string;
  bookId: string;
  ozonProductId: string | null;
  publishPayload: Record<string, unknown> | null;
  status: OzonProductStatus;
  averageMarketPrice: number | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export enum OzonProductStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  FAILED = 'failed',
}

export interface IOzonPriceLookupResult {
  averagePrice: number;
  results: Array<{
    title: string;
    price: number;
    url?: string;
  }>;
}
