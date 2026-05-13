import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { BooksService } from '../books/books.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { SearchBooksDto } from './dto/search-books.dto';
import { DuplicateFiltersDto } from './dto/duplicate-filters.dto';
import { DuplicateResolution } from './entities/duplicate-resolution.entity';
import { UserRole, BookStatus } from '@bookscanner/shared';

@Injectable()
export class AdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly booksService: BooksService,
    @InjectRepository(DuplicateResolution)
    private readonly dupResRepository: Repository<DuplicateResolution>,
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

  async getStatistics(dateFrom?: string, dateTo?: string, includeActiveSessions = false) {
    const now = new Date();

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const periodStart = dateFrom ? new Date(dateFrom) : startOfToday;
    const periodEnd = dateTo ? new Date(dateTo) : endOfToday;

    const miniPagination = new PaginationDto();
    miniPagination.page = 1;
    miniPagination.limit = 1;

    const [
      cardsToday,
      cardsPeriod,
      perUserRaw,
      usersResult,
      totalCards,
      pendingReviewCount,
      totalAdmins,
      totalOperators,
      duplicatesCount,
      ocrErrorsCount,
      ozonErrorsCount,
      underpricedCount,
      copiesCount,
    ] = await Promise.all([
      this.booksService.countCreatedSince(startOfToday, endOfToday, true),
      this.booksService.countCreatedSince(periodStart, periodEnd, true),
      this.booksService.getPerUserBookCounts(periodStart, periodEnd, includeActiveSessions),
      this.usersService.findAll(miniPagination),
      this.booksService.countCreatedSince(),
      this.booksService.countPendingReview(),
      this.usersService.countByRole(UserRole.ADMIN),
      this.usersService.countByRole(UserRole.OPERATOR),
      this.booksService.countDuplicates(),
      this.booksService.countOcrFailed(),
      this.booksService.countOzonFailed(),
      this.booksService.countUnderpriced(),
      this.booksService.countCopies(),
    ]);

    return {
      totalCards,
      totalUsers: usersResult.meta.total,
      totalAdmins,
      totalOperators,
      cardsToday,
      cardsThisWeek: cardsPeriod,
      pendingReviewCount,
      duplicatesCount,
      ocrErrorsCount,
      ozonErrorsCount,
      underpricedCount,
      copiesCount,
      perUser: perUserRaw.map((u) => {
        const completed = parseInt(u.completedCount, 10);
        const active = parseInt(u.activeCount, 10);
        return {
          userId: u.userId,
          fullName: u.fullName,
          cardsCount: includeActiveSessions ? completed + active : completed,
          completedCardsCount: completed,
          activeCardsCount: active,
        };
      }),
    };
  }

  async searchBooks(dto: SearchBooksDto) {
    const { search, boxId, createdById, dateFrom, dateTo, status, priceMin, priceMax, yearFrom, yearTo, printRunMin, printRunMax } = dto;
    return this.booksService.findAll('', UserRole.ADMIN, dto, boxId, search, createdById, dateFrom, dateTo, undefined, status, priceMin, priceMax, yearFrom, yearTo, printRunMin, printRunMax);
  }

  async getPendingReviewBooks(dto: SearchBooksDto) {
    const { boxId, createdById, dateFrom, dateTo, search, priceMin, priceMax, yearFrom, yearTo, printRunMin, printRunMax } = dto;
    return this.booksService.findAll('', UserRole.ADMIN, dto, boxId, search, createdById, dateFrom, dateTo, undefined, BookStatus.PENDING_REVIEW, priceMin, priceMax, yearFrom, yearTo, printRunMin, printRunMax);
  }

  async getPendingReviewCountsByBox() {
    return this.booksService.countPendingReviewByBox();
  }

  async getPendingReviewIds(
    boxId?: string,
    filters?: {
      search?: string;
      createdById?: string;
      dateFrom?: string;
      dateTo?: string;
      priceMin?: string;
      priceMax?: string;
      yearFrom?: string;
      yearTo?: string;
      printRunMin?: string;
      printRunMax?: string;
    },
  ) {
    return this.booksService.getPendingReviewIds(boxId, filters);
  }

  async getFailedPublicationBooks(pagination: PaginationDto) {
    return this.booksService.getFailedPublicationBooks(pagination);
  }

  async getOcrFailedBooks(pagination: PaginationDto) {
    return this.booksService.getOcrFailedBooks(pagination);
  }

  async getUnderpricedBooks(pagination: PaginationDto) {
    return this.booksService.getUnderpricedBooks(pagination);
  }

  async getDuplicates(dto: DuplicateFiltersDto) {
    const resolvedPairs = await this.dupResRepository.find({
      select: ['book1Id', 'book2Id'],
    });
    return this.booksService.getDuplicatePairs(resolvedPairs, dto, dto.page, dto.limit);
  }

  async resolveDuplicate(book1Id: string, book2Id: string, adminId: string) {
    const [id1, id2] = [book1Id, book2Id].sort();
    await this.dupResRepository
      .createQueryBuilder()
      .insert()
      .into(DuplicateResolution)
      .values({ book1Id: id1, book2Id: id2, resolvedById: adminId })
      .orIgnore()
      .execute();
  }

  async markCopies(bookIds: string[]) {
    if (!bookIds.length) return;
    await this.booksService.markAsCopies(bookIds);
  }

  async getCopyGroups(dto: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'published' | 'not_published' | 'archived';
  }) {
    return this.booksService.getCopyGroups(
      dto.page ?? 1,
      dto.limit ?? 20,
      { search: dto.search, status: dto.status },
    );
  }
}
