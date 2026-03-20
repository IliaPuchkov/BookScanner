import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENC_PREFIX = 'enc:';
const SALT = 'bookscanner-ozon-v1';

/**
 * AES-256-GCM encryption for sensitive values stored in the database.
 * Key is derived from ENCRYPTION_SECRET env var (falls back to JWT_SECRET).
 * Encrypted format: "enc:<iv_b64>:<authTag_b64>:<ciphertext_b64>"
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secret =
      this.configService.get<string>('ENCRYPTION_SECRET') ||
      this.configService.getOrThrow<string>('JWT_SECRET');

    this.key = scryptSync(secret, SALT, 32) as Buffer;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12); // 96-bit IV recommended for GCM
    const cipher = createCipheriv(ALGORITHM, this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag(); // 128-bit auth tag

    return [
      ENC_PREFIX + iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  decrypt(value: string): string {
    if (!value.startsWith(ENC_PREFIX)) {
      // Plaintext (legacy / not yet encrypted) — return as-is
      return value;
    }

    const withoutPrefix = value.slice(ENC_PREFIX.length);
    const parts = withoutPrefix.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted value format');
    }

    const [ivB64, authTagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const data = Buffer.from(dataB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);

    return (
      decipher.update(data).toString('utf8') + decipher.final('utf8')
    );
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(ENC_PREFIX);
  }
}
