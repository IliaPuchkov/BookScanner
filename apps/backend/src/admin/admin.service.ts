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

    const [cardsToday, cardsPeriod, perUserRaw, usersResult, totalCards, pendingReviewCount, totalAdmins, totalOperators] = await Promise.all([
      this.booksService.countCreatedSince(startOfToday),
      this.booksService.countCreatedSince(startOfPeriod),
      this.booksService.getPerUserBookCounts(startOfPeriod),
      this.usersService.findAll(miniPagination),
      this.booksService.countCreatedSince(),
      this.booksService.countPendingReview(),
      this.usersService.countByRole(UserRole.ADMIN),
      this.usersService.countByRole(UserRole.OPERATOR),
    ]);

    return {
      totalCards,
      totalUsers: usersResult.meta.total,
      totalAdmins,
      totalOperators,
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
    const { search, boxId, createdById, dateFrom, dateTo, status } = dto;
    // Admin sees all books. Pass dto directly to preserve the skip getter on PaginationDto.
    return this.booksService.findAll('', UserRole.ADMIN, dto, boxId, search, createdById, dateFrom, dateTo, undefined, status);
  }

  async getPendingReviewBooks(dto: SearchBooksDto) {
    const { boxId, createdById, dateFrom, dateTo, search } = dto;
    return this.booksService.findAll('', UserRole.ADMIN, dto, boxId, search, createdById, dateFrom, dateTo, undefined, BookStatus.PENDING_REVIEW);
  }

  async getPendingReviewCountsByBox() {
    return this.booksService.countPendingReviewByBox();
  }

  async getPendingReviewIds(boxId?: string) {
    return this.booksService.getPendingReviewIds(boxId);
  }

  async getFailedPublicationBooks(pagination: PaginationDto) {
    return this.booksService.getFailedPublicationBooks(pagination);
  }
}
