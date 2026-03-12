import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisionService } from './vision.service';
import { VisionController } from './vision.controller';
import { OcrResult } from './entities/ocr-result.entity';
import { BooksModule } from '../books/books.module';
import { PhotosModule } from '../photos/photos.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OcrResult]),
    BooksModule,
    PhotosModule,
    SettingsModule,
  ],
  controllers: [VisionController],
  providers: [VisionService],
  exports: [VisionService],
})
export class VisionModule {}
