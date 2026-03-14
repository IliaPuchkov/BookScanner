export interface IStorageProvider {
  upload(
    file: Express.Multer.File,
    key: string,
  ): Promise<{ url: string; key: string }>;
  delete(key: string): Promise<void>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
  download(key: string): Promise<Buffer>;
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER';
