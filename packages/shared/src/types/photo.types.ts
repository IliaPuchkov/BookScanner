export interface IBookPhoto {
  id: string;
  bookId: string;
  fileUrl: string;
  fileKey: string | null;
  sortOrder: number;
  originalFilename: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  createdAt: Date;
}

export interface IReorderPhotos {
  photoIds: string[];
}
