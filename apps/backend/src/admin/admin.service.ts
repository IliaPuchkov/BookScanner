import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { BooksService } from '../books/books.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { SearchBooksDto } from './dto/search-books.dto';
import { UserRole, BookStatus } from '@bookscanner/shared';

@Injectable()
export class AdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly booksService: BooksService,
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

    const [cardsToday, cardsPeriod, perUserRaw, usersResult, booksResult, pendingReviewCount] = await Promise.all([
      this.booksService.countCreatedSince(startOfToday),
      this.booksService.countCreatedSince(startOfPeriod),
      this.booksService.getPerUserBookCounts(startOfPeriod),
      this.usersService.findAll(miniPagination),
      this.booksService.findAll('', UserRole.ADMIN, miniPagination),
      this.booksService.countPendingReview(),
    ]);

    return {
      totalCards: booksResult.meta.total,
      totalUsers: usersResult.meta.total,
      cardsToday,
      cardsThisWeek: cardsPeriod,
      pendingReviewCount,
      perUser: perUserRaw.map((u) => ({
        userId: u.userId,
        fullName: u.fullName,
        cardsCount: parseInt(u.booksCount, 10),
      })),
    };
  }

  async searchBooks(dto: SearchBooksDto) {
    const { search, boxId, createdById, dateFrom, dateTo, status, ...pagination } = dto;
    // Admin sees all books
    return this.booksService.findAll('', UserRole.ADMIN, pagination as PaginationDto, boxId, search, createdById, dateFrom, dateTo, undefined, status);
  }

  async getPendingReviewBooks(pagination: PaginationDto) {
    return this.booksService.findAll('', UserRole.ADMIN, pagination, undefined, undefined, undefined, undefined, undefined, undefined, BookStatus.PENDING_REVIEW);
  }
}
