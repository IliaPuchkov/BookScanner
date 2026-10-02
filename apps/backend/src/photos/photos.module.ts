import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';
import { BookPhoto } from './entities/book-photo.entity';
import { StorageModule } from './storage/storage.module';
import { SettingsModule } from '../settings/settings.module';
import { ThumbnailService } from './thumbnail.service';
import { BookPhotoSubscriber } from './book-photo.subscriber';

@Module({
  imports: [TypeOrmModule.forFeature([BookPhoto]), StorageModule.register(), SettingsModule],
  controllers: [PhotosController],
  providers: [PhotosService, ThumbnailService, BookPhotoSubscriber],
  exports: [PhotosService, StorageModule],
})
export class PhotosModule {}
