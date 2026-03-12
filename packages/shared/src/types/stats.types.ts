export enum ActivityAction {
  CARD_CREATED = 'card_created',
  CARD_UPDATED = 'card_updated',
  PHOTO_UPLOADED = 'photo_uploaded',
  PUBLISHED_TO_OZON = 'published_to_ozon',
  LOGIN = 'login',
  EXTRACTION_RUN = 'extraction_run',
}

export interface IActivityLog {
  id: string;
  userId: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface IStatsSummary {
  totalBooks: number;
  totalPublished: number;
  totalUsers: number;
  booksToday: number;
  booksThisWeek: number;
  perUser: Array<{
    userId: string;
    fullName: string;
    booksCount: number;
  }>;
}
