import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { BooksService } from '../books/books.service';
import { StatsService } from '../stats/stats.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UserRole } from '@bookscanner/shared';

@Injectable()
export class AdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly booksService: BooksService,
    private readonly statsService: StatsService,
  ) {}

  async getUsers(pagination: PaginationDto) {
    return this.usersService.findAll(pagination);
  }

  async createUser(dto: CreateUserDto) {
    const user = await this.usersService.create(dto);
    // Auto-approve when created by admin
    return this.usersService.update(user.id, { isApproved: true });
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  async deleteUser(id: string) {
    return this.usersService.remove(id);
  }

  async getStatistics(days?: number) {
    const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : undefined;

    const [globalStats, perUser, dailyTrends] = await Promise.all([
      this.statsService.getGlobalStats(since),
      this.statsService.getPerUserBookCounts(),
      this.statsService.getDailyTrends(days || 30),
    ]);

    return {
      globalStats,
      perUser,
      dailyTrends,
    };
  }

  async searchBooks(pagination: PaginationDto, search?: string) {
    // Admin sees all books
    return this.booksService.findAll('', UserRole.ADMIN, pagination, undefined, search);
  }
}
