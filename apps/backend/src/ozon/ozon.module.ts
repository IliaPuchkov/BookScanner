import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OzonService } from './ozon.service';
import { OzonController } from './ozon.controller';
import { OzonProduct } from './entities/ozon-product.entity';
import { OzonApiClient } from './ozon-api.client';
import { OzonStatusCron } from './ozon-status.cron';
import { BooksModule } from '../books/books.module';

@Module({
  imports: [TypeOrmModule.forFeature([OzonProduct]), BooksModule],
  controllers: [OzonController],
  providers: [OzonService, OzonApiClient, OzonStatusCron],
  exports: [OzonService],
})
export class OzonModule {}
