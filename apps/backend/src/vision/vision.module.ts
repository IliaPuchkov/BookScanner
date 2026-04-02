import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { VisionService } from './vision.service';
import { VisionController } from './vision.controller';
import { VisionProcessor } from './vision.processor';
import { OcrResult } from './entities/ocr-result.entity';
import { BooksModule } from '../books/books.module';
import { PhotosModule } from '../photos/photos.module';
import { SettingsModule } from '../settings/settings.module';
import { VISION_QUEUE } from './vision.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([OcrResult]),
    BooksModule,
    PhotosModule,
    SettingsModule,
    BullModule.registerQueue({ name: VISION_QUEUE }),
  ],
  controllers: [VisionController],
  providers: [VisionService, VisionProcessor],
  exports: [VisionService],
})
export class VisionModule {}
