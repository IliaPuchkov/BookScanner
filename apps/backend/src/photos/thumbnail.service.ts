import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import sharp from 'sharp';
import { BookPhoto } from './entities/book-photo.entity';
import { IStorageProvider, STORAGE_PROVIDER } from './storage/storage.interface';

const THUMB_WIDTH = 320; // card cover is 70x100dp ≈ 210x300px at 3x density
const THUMB_QUALITY = 70; // ~12 KB vs ~800 KB original (measured on prod sample)
const CONCURRENCY = 2;
// Pending jobs beyond this are dropped; they are re-queued the next time the
// cover is loaded. Keeps memory bounded on the 1 GB host.
const MAX_QUEUED = 500;

// Keep sharp's footprint small inside the 512 MB backend container.
sharp.cache(false);
sharp.concurrency(1);

/**
 * Lazily generates cover thumbnails: the first time a cover (sortOrder 0)
 * without a thumbnail is loaded, it is queued here; the response still uses
 * the original, later loads get the thumbnail.
 */
@Injectable()
export class ThumbnailService {
  private readonly logger = new Logger(ThumbnailService.name);
  private readonly queued = new Set<string>();
  private readonly pending: string[] = [];
  private running = 0;

  constructor(
    @InjectRepository(BookPhoto)
    private readonly photosRepository: Repository<BookPhoto>,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: IStorageProvider,
  ) {}

  enqueue(photo: Pick<BookPhoto, 'id' | 'sortOrder' | 'thumbnailUrl'>): void {
    if (photo.sortOrder !== 0 || photo.thumbnailUrl) return;
    if (this.queued.has(photo.id) || this.queued.size >= MAX_QUEUED) return;
    this.queued.add(photo.id);
    this.pending.push(photo.id);
    this.drain();
  }

  async deleteFor(photo: Pick<BookPhoto, 'thumbnailKey'>): Promise<void> {
    if (!photo.thumbnailKey) return;
    try {
      await this.storage.delete(photo.thumbnailKey);
    } catch (err) {
      this.logger.warn(`Failed to delete thumbnail ${photo.thumbnailKey}: ${err}`);
    }
  }

  private drain(): void {
    while (this.running < CONCURRENCY && this.pending.length > 0) {
      const id = this.pending.shift()!;
      this.running++;
      this.generate(id)
        .catch((err) =>
          this.logger.warn(`Thumbnail for photo ${id} failed: ${err?.message ?? err}`),
        )
        .finally(() => {
          this.running--;
          this.queued.delete(id);
          this.drain();
        });
    }
  }

  private async generate(photoId: string): Promise<void> {
    const photo = await this.photosRepository.findOne({ where: { id: photoId } });
    if (!photo || photo.thumbnailUrl || photo.sortOrder !== 0) return;

    const original = photo.fileKey
      ? await this.storage.download(photo.fileKey)
      : Buffer.from(await (await fetch(photo.fileUrl)).arrayBuffer());

    const buffer = await sharp(original)
      .rotate() // apply EXIF orientation before stripping metadata
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
      .toBuffer();

    const key = `thumbnails/${photo.id}.jpg`;
    const uploaded = await this.storage.upload(
      { buffer, mimetype: 'image/jpeg', size: buffer.length } as Express.Multer.File,
      key,
    );

    // Only attach if the original wasn't replaced meanwhile.
    const result = await this.photosRepository.update(
      { id: photo.id, fileUrl: photo.fileUrl },
      { thumbnailUrl: uploaded.url, thumbnailKey: uploaded.key },
    );
    if (!result.affected) await this.deleteFor({ thumbnailKey: uploaded.key });
  }
}
