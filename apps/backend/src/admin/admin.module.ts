import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { BooksModule } from '../books/books.module';
import { StatsModule } from '../stats/stats.module';
import { DuplicateResolution } from './entities/duplicate-resolution.entity';

@Module({
  imports: [UsersModule, BooksModule, StatsModule, TypeOrmModule.forFeature([DuplicateResolution])],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
