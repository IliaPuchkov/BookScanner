export enum UserRole {
  OPERATOR = 'operator',
  ADMIN = 'admin',
}

export enum PaperType {
  OFFSET = 'офсетная',
  GLOSSY = 'глянцевая',
  MATTE = 'матовая',
}

export enum CoverType {
  HARDCOVER = 'твердый переплет',
  SOFTCOVER = 'мягкий переплет',
}

export interface User {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  role: UserRole;
  isApproved: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}

export interface BookDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface BookPhoto {
  id: string;
  bookId: string;
  fileUrl: string;
  sortOrder: number;
  originalFilename?: string;
  mimeType?: string;
  createdAt: string;
}

export interface Book {
  id: string;
  sku: string;
  title: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  yearPublished?: number;
  dimensions?: BookDimensions;
  weightGross?: number;
  weightNet?: number;
  paperType: PaperType;
  coverType: CoverType;
  pageCount?: number;
  language: string;
  price: number;
  annotation?: string;
  hashtags?: string[];
  condition: string;
  bookType: string;
  direction: string;
  boxId: string;
  createdById: string;
  photos: BookPhoto[];
  publishedToOzon?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Box {
  id: string;
  boxNumber: string;
  description?: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface StatsSummary {
  totalCards: number;
  totalUsers: number;
  cardsToday: number;
  cardsThisWeek: number;
  perUser: Array<{
    userId: string;
    fullName: string;
    cardsCount: number;
  }>;
}

export interface CreateBookDto {
  title: string;
  boxId: string;
  author?: string;
  isbn?: string;
  publisher?: string;
  yearPublished?: number;
  dimensions?: BookDimensions;
  weightGross?: number;
  weightNet?: number;
  paperType?: PaperType;
  coverType?: CoverType;
  pageCount?: number;
  language?: string;
  price?: number;
  annotation?: string;
  hashtags?: string[];
}

export interface UpdateBookDto extends Partial<Omit<CreateBookDto, 'boxId'>> {}

export interface CreateBoxDto {
  boxNumber: string;
  description?: string;
}

export interface OcrResult {
  id: string;
  bookId: string;
  extractedData?: Record<string, unknown>;
  photo01Extraction?: Record<string, unknown>;
  photo02Extraction?: Record<string, unknown>;
  status: string;
  errorMessage?: string;
}
