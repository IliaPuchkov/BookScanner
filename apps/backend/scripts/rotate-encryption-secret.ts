/**
 * One-off script: re-encrypts all Ozon store apiKey values in system_settings
 * from ENCRYPTION_SECRET_OLD to ENCRYPTION_SECRET_NEW.
 *
 * Usage (from apps/backend/):
 *   ENCRYPTION_SECRET_OLD=asdfuoausdnofi \
 *   ENCRYPTION_SECRET_NEW=$(openssl rand -hex 32) \
 *   npx ts-node scripts/rotate-encryption-secret.ts
 *
 * After success: update ENCRYPTION_SECRET in .env, then restart the backend.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const ALGORITHM = 'aes-256-gcm';
const SALT = 'bookscanner-ozon-v1';
const ENC_PREFIX = 'enc:';

function deriveKey(secret: string): Buffer {
  return scryptSync(secret, SALT, 32) as Buffer;
}

function decrypt(value: string, key: Buffer): string {
  if (!value.startsWith(ENC_PREFIX)) return value;

  const parts = value.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error(`Unexpected format: ${value.slice(0, 30)}…`);

  const [ivB64, authTagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  return decipher.update(Buffer.from(dataB64, 'base64')).toString('utf8') + decipher.final('utf8');
}

function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [ENC_PREFIX + iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

async function main() {
  const oldSecret = process.env.ENCRYPTION_SECRET_OLD;
  const newSecret = process.env.ENCRYPTION_SECRET_NEW;

  if (!oldSecret || !newSecret) {
    console.error('ERROR: ENCRYPTION_SECRET_OLD and ENCRYPTION_SECRET_NEW must be set');
    process.exit(1);
  }

  if (oldSecret === newSecret) {
    console.error('ERROR: OLD and NEW secrets are identical — nothing to do');
    process.exit(1);
  }

  const oldKey = deriveKey(oldSecret);
  const newKey = deriveKey(newSecret);

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  await client.connect();
  console.log('Connected to PostgreSQL');

  try {
    const res = await client.query<{ id: string; value: string }>(
      `SELECT id, value FROM system_settings WHERE key = 'ozon_stores'`,
    );

    if (res.rowCount === 0) {
      console.log("Row 'ozon_stores' not found in system_settings — nothing to rotate.");
      return;
    }

    const { id, value: rawValue } = res.rows[0];
    let stores: Array<Record<string, unknown>>;

    try {
      stores = JSON.parse(rawValue);
    } catch {
      throw new Error('ozon_stores value is not valid JSON');
    }

    if (!Array.isArray(stores)) {
      throw new Error('ozon_stores value is not a JSON array');
    }

    let rotated = 0;
    let skipped = 0;

    for (const store of stores) {
      const apiKey = store['apiKey'];

      if (typeof apiKey !== 'string') {
        skipped++;
        continue;
      }

      if (!apiKey.startsWith(ENC_PREFIX)) {
        // Plaintext key — encrypt with new secret
        store['apiKey'] = encrypt(apiKey, newKey);
        rotated++;
        console.log(`  store "${store['name'] ?? store['id']}": plaintext → encrypted with new secret`);
        continue;
      }

      // Decrypt with old key, re-encrypt with new key
      let plaintext: string;
      try {
        plaintext = decrypt(apiKey, oldKey);
      } catch (err) {
        throw new Error(
          `Failed to decrypt apiKey for store "${store['name'] ?? store['id']}": ${(err as Error).message}.\n` +
          `Check that ENCRYPTION_SECRET_OLD is correct.`,
        );
      }

      store['apiKey'] = encrypt(plaintext, newKey);
      rotated++;
      console.log(`  store "${store['name'] ?? store['id']}": rotated`);
    }

    if (rotated === 0) {
      console.log('No apiKey fields found to rotate.');
      return;
    }

    await client.query(`UPDATE system_settings SET value = $1 WHERE id = $2`, [
      JSON.stringify(stores),
      id,
    ]);

    console.log(`\nDone: ${rotated} key(s) rotated, ${skipped} skipped.`);
    console.log('\nNext steps:');
    console.log(`  1. Update ENCRYPTION_SECRET in .env to: ${newSecret}`);
    console.log('  2. Restart backend: docker restart bookscanner-backend');
    console.log('  3. Verify admin Settings screen loads all stores correctly');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
