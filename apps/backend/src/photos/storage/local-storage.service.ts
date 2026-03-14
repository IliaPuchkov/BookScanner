import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { IStorageProvider } from './storage.interface';

@Injectable()
export class LocalStorageService implements IStorageProvider {
  private readonly uploadDir = path.join(process.cwd(), 'uploads');
  private readonly baseUrl: string;

  constructor(configService?: ConfigService) {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
    const port = configService?.get<number>('BACKEND_PORT') ?? 3000;
    const host = configService?.get<string>('BACKEND_HOST') ?? 'localhost';
    this.baseUrl = `http://${host}:${port}`;
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
      url: `${this.baseUrl}/uploads/${key}`,
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

  async download(key: string): Promise<Buffer> {
    const filePath = path.join(this.uploadDir, key);
    return fs.readFileSync(filePath);
  }
}
