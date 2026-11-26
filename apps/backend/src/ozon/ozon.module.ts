import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PhotosModule } from '../photos/photos.module';
import { VideoCoverService } from './video-cover/video-cover.service';
import { VideoCoverProcessor } from './video-cover/video-cover.processor';
import { VideoCoverCron } from './video-cover/video-cover.cron';
import { VideoCoverController } from './video-cover/video-cover.controller';
import { VIDEO_COVER_QUEUE } from './video-cover/video-cover.constants';
import { RichContentService } from './rich-content/rich-content.service';
import { RichContentCron } from './rich-content/rich-content.cron';
import { RichContentController } from './rich-content/rich-content.controller';
import { ExtraPhotosService } from './extra-photos/extra-photos.service';
import { ExtraPhotosCron } from './extra-photos/extra-photos.cron';
import { ExtraPhotosController } from './extra-photos/extra-photos.controller';
import { ContentScopeService } from './content-scope.service';
import { ContentScopeController } from './content-scope.controller';
import { OzonService } from './ozon.service';
import { OzonController } from './ozon.controller';
import { OzonProduct } from './entities/ozon-product.entity';
import { OzonApiClient } from './ozon-api.client';
import { OzonStatusCron } from './ozon-status.cron';
import { BooksModule } from '../books/books.module';
import { SettingsModule } from '../settings/settings.module';
import { EncryptionService } from '../common/encryption.service';
import { Book } from '../books/entities/book.entity';
import { BookPhoto } from '../photos/entities/book-photo.entity';
import { Box } from '../boxes/entities/box.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([OzonProduct, Book, BookPhoto, Box]),
    BooksModule,
    SettingsModule,
    PhotosModule,
    BullModule.registerQueue({ name: VIDEO_COVER_QUEUE }),
  ],
  controllers: [OzonController, VideoCoverController, RichContentController, ExtraPhotosController, ContentScopeController],
  providers: [
    OzonService,
    OzonApiClient,
    OzonStatusCron,
    EncryptionService,
    VideoCoverService,
    VideoCoverProcessor,
    VideoCoverCron,
    RichContentService,
    RichContentCron,
    ExtraPhotosService,
    ExtraPhotosCron,
    ContentScopeService,
  ],
  exports: [OzonService],
})
export class OzonModule {}
