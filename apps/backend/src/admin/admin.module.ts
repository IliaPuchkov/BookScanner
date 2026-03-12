import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { UsersModule } from '../users/users.module';
import { BooksModule } from '../books/books.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [UsersModule, BooksModule, StatsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
