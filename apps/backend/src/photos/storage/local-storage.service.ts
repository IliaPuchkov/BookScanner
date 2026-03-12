import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { IStorageProvider } from './storage.interface';

@Injectable()
export class LocalStorageService implements IStorageProvider {
  private readonly uploadDir = path.join(process.cwd(), 'uploads');

  constructor() {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async upload(
    file: Express.Multer.File,
    key: string,
  ): Promise<{ url: string; key: string }> {
    const filePath = path.join(this.uploadDir, key);
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, file.buffer);

    return {
      url: `/uploads/${key}`,
      key,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.uploadDir, key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  async getSignedUrl(key: string): Promise<string> {
    return `/uploads/${key}`;
  }
}
