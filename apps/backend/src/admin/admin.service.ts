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
    const periodDays = days || 7;
    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfPeriod = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);

    const miniPagination = new PaginationDto();
    miniPagination.page = 1;
    miniPagination.limit = 1;

    const [todayStats, periodStats, perUserRaw, usersResult, booksResult] = await Promise.all([
      this.statsService.getGlobalStats(startOfToday),
      this.statsService.getGlobalStats(startOfPeriod),
      this.statsService.getPerUserBookCounts(),
      this.usersService.findAll(miniPagination),
      this.booksService.findAll('', UserRole.ADMIN, miniPagination),
    ]);

    const getCount = (
      stats: Array<{ action: string; count: string }>,
      action: string,
    ) => parseInt(stats.find((s) => s.action === action)?.count ?? '0', 10);

    return {
      totalCards: booksResult.meta.total,
      totalUsers: usersResult.meta.total,
      cardsToday: getCount(todayStats, 'card_created'),
      cardsThisWeek: getCount(periodStats, 'card_created'),
      perUser: perUserRaw.map((u: { userId: string; fullName: string; booksCount: string }) => ({
        userId: u.userId,
        fullName: u.fullName,
        cardsCount: parseInt(u.booksCount, 10),
      })),
    };
  }

  async searchBooks(pagination: PaginationDto, search?: string) {
    // Admin sees all books
    return this.booksService.findAll('', UserRole.ADMIN, pagination, undefined, search);
  }
}
