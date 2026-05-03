import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BooksService } from './books.service';
import { BooksController } from './books.controller';
import { Book } from './entities/book.entity';
import { BoxesModule } from '../boxes/boxes.module';
import { StatsModule } from '../stats/stats.module';
import { PhotosModule } from '../photos/photos.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [TypeOrmModule.forFeature([Book]), BoxesModule, StatsModule, PhotosModule, SettingsModule],
  controllers: [BooksController],
  providers: [BooksService],
  exports: [BooksService],
})
export class BooksModule {}
