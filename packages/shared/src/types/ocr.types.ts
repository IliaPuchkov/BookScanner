export interface IExtractionResult {
  title?: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  yearPublished?: number;
  width?: number;
  height?: number;
  depth?: number;
  weightGross?: number;
  weightNet?: number;
  paperType?: string;
  coverType?: string;
  pageCount?: number;
  annotation?: string;
  language?: string;
}

export interface IOcrResult {
  id: string;
  bookId: string;
  rawOcrText: string | null;
  extractedData: IExtractionResult | null;
  photo01Extraction: IExtractionResult | null;
  photo02Extraction: IExtractionResult | null;
  status: OcrStatus;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export enum OcrStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
