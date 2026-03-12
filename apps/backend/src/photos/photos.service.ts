import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { BookPhoto } from './entities/book-photo.entity';
import { IStorageProvider, STORAGE_PROVIDER } from './storage/storage.interface';
import { ReorderPhotosDto } from './dto/reorder-photos.dto';
import { MAX_PHOTOS_PER_BOOK, MAX_FILE_SIZE_BYTES, ALLOWED_MIME_TYPES } from '@bookscanner/shared';

@Injectable()
export class PhotosService {
  constructor(
    @InjectRepository(BookPhoto)
    private readonly photosRepository: Repository<BookPhoto>,
    @Inject(STORAGE_PROVIDER)
    private readonly storage: IStorageProvider,
  ) {}

  async upload(
    bookId: string,
    files: Express.Multer.File[],
  ): Promise<BookPhoto[]> {
    const existingCount = await this.photosRepository.count({
      where: { bookId },
    });

    if (existingCount + files.length > MAX_PHOTOS_PER_BOOK) {
      throw new BadRequestException(
        `Максимум ${MAX_PHOTOS_PER_BOOK} фотографий на книгу. Текущее количество: ${existingCount}`,
      );
    }

    const photos: BookPhoto[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      this.validateFile(file);

      const ext = path.extname(file.originalname);
      const key = `books/${bookId}/${uuidv4()}${ext}`;
      const result = await this.storage.upload(file, key);

      const photo = this.photosRepository.create({
        bookId,
        fileUrl: result.url,
        fileKey: result.key,
        sortOrder: existingCount + i,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
      });

      photos.push(await this.photosRepository.save(photo));
    }

    return photos;
  }

  async replace(
    bookId: string,
    photoId: string,
    file: Express.Multer.File,
  ): Promise<BookPhoto> {
    this.validateFile(file);

    const photo = await this.photosRepository.findOne({
      where: { id: photoId, bookId },
    });

    if (!photo) {
      throw new NotFoundException('Фотография не найдена');
    }

    // Delete old file
    if (photo.fileKey) {
      await this.storage.delete(photo.fileKey);
    }

    // Upload new file
    const ext = path.extname(file.originalname);
    const key = `books/${bookId}/${uuidv4()}${ext}`;
    const result = await this.storage.upload(file, key);

    photo.fileUrl = result.url;
    photo.fileKey = result.key;
    photo.originalFilename = file.originalname;
    photo.mimeType = file.mimetype;
    photo.fileSizeBytes = file.size;

    return this.photosRepository.save(photo);
  }

  async remove(bookId: string, photoId: string): Promise<void> {
    const photo = await this.photosRepository.findOne({
      where: { id: photoId, bookId },
    });

    if (!photo) {
      throw new NotFoundException('Фотография не найдена');
    }

    if (photo.fileKey) {
      await this.storage.delete(photo.fileKey);
    }

    await this.photosRepository.remove(photo);
  }

  async reorder(bookId: string, dto: ReorderPhotosDto): Promise<BookPhoto[]> {
    const photos = await this.photosRepository.find({ where: { bookId } });

    const photoMap = new Map(photos.map((p) => [p.id, p]));

    for (let i = 0; i < dto.photoIds.length; i++) {
      const photo = photoMap.get(dto.photoIds[i]);
      if (!photo) {
        throw new NotFoundException(`Фотография ${dto.photoIds[i]} не найдена`);
      }
      photo.sortOrder = i;
    }

    return this.photosRepository.save(photos);
  }

  async findByBookId(bookId: string): Promise<BookPhoto[]> {
    return this.photosRepository.find({
      where: { bookId },
      order: { sortOrder: 'ASC' },
    });
  }

  async deleteAllForBook(bookId: string): Promise<void> {
    const photos = await this.findByBookId(bookId);
    for (const photo of photos) {
      if (photo.fileKey) {
        await this.storage.delete(photo.fileKey);
      }
    }
    await this.photosRepository.remove(photos);
  }

  private validateFile(file: Express.Multer.File) {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype as any)) {
      throw new BadRequestException(
        `Недопустимый формат файла. Разрешены: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `Размер файла превышает максимально допустимый (10 МБ)`,
      );
    }
  }
}
