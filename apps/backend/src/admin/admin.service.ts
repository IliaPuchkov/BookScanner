import { Injectable, ForbiddenException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { BooksService } from '../books/books.service';
import { StatsService } from '../stats/stats.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { SearchBooksDto } from './dto/search-books.dto';
import { DuplicateFiltersDto } from './dto/duplicate-filters.dto';
import { DuplicateResolution } from './entities/duplicate-resolution.entity';
import { UserRole, BookStatus } from '@bookscanner/shared';

// No look-alikes (0/O, 1/l/I) — the password is read out or retyped by hand.
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';

/** 10 random characters with at least one lower, upper and digit (StrongPassword). */
export function generateTemporaryPassword(): string {
  const all = LOWER + UPPER + DIGITS;
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS)];
  while (chars.length < 10) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

@Injectable()
export class AdminService {
  constructor(
    private readonly usersService: UsersService,
    private readonly booksService: BooksService,
    private readonly statsService: StatsService,
    @InjectRepository(DuplicateResolution)
    private readonly dupResRepository: Repository<DuplicateResolution>,
  ) {}

  async getUsers(pagination: PaginationDto) {
    return this.usersService.findAll(pagination);
  }

  async createUser(dto: CreateUserDto) {
    // The admin chose this password, so the user must replace it on first login.
    const user = await this.usersService.create(dto, true);
    // Auto-approve when created by admin
    return this.usersService.update(user.id, { isApproved: true });
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  /**
   * Admins can set a temporary password for operators only, never for another
   * admin. Without `password` one is generated and returned once.
   */
  async setUserPassword(
    adminId: string,
    id: string,
    password?: string,
  ): Promise<{ generatedPassword?: string }> {
    const user = await this.usersService.findById(id);
    if (user.role === UserRole.ADMIN) {
      throw new ForbiddenException('Нельзя задать пароль администратору');
    }
    const generated = password ? undefined : generateTemporaryPassword();
    await this.usersService.setPassword(id, password ?? generated!, true);
    await this.statsService.logActivity(adminId, 'password_reset', 'user', id);
    return generated ? { generatedPassword: generated } : {};
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
      libraryCount,
    ] = await Promise.all([
      this.booksService.countCreatedSince(startOfToday, endOfToday, true),
      this.booksService.countCreatedSince(periodStart, periodEnd, true),
      this.booksService.getPerUserBookCounts(periodStart, periodEnd, includeActiveSessions),
      this.usersService.findAll(miniPagination),
      this.booksService.countCreatedSince(),
      this.booksService.countPendingReview(),
      this.usersService.countByRole(UserRole.ADMIN),
      this.usersService.countByRole(UserRole.OPERATOR),
      this.dupResRepository
        .find({ select: ['book1Id', 'book2Id'] })
        .then((pairs) => this.booksService.countDuplicates(pairs)),
      this.booksService.countOcrFailed(),
      this.booksService.countOzonFailed(),
      this.booksService.countUnderpriced(),
      this.booksService.countCopies(),
      this.booksService.countLibrary(),
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
      libraryCount,
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
    await this.resolveDuplicates([{ book1Id, book2Id }], adminId);
  }

  /** Resolves pairs as "not copies"; the pairs stay in their groups, only their state changes. */
  async resolveDuplicates(pairs: Array<{ book1Id: string; book2Id: string }>, adminId: string) {
    const values = pairs
      .filter((p) => p.book1Id !== p.book2Id)
      .map((p) => {
        const [book1Id, book2Id] = [p.book1Id, p.book2Id].sort();
        return { book1Id, book2Id, resolvedById: adminId };
      });
    if (!values.length) return;
    await this.dupResRepository
      .createQueryBuilder()
      .insert()
      .into(DuplicateResolution)
      .values(values)
      .orIgnore()
      .execute();
    this.booksService.dropDuplicateStates();
  }

  /** Takes back "not copies" for these pairs — they are undecided again. */
  async unresolveDuplicates(pairs: Array<{ book1Id: string; book2Id: string }>) {
    const sorted = pairs.map((p) => [p.book1Id, p.book2Id].sort());
    if (!sorted.length) return;
    await this.dupResRepository.manager.query(
      `DELETE FROM duplicate_resolutions r
       USING unnest($1::uuid[], $2::uuid[]) AS p(b1, b2)
       WHERE r.book1_id = p.b1 AND r.book2_id = p.b2`,
      [sorted.map((p) => p[0]), sorted.map((p) => p[1])],
    );
    this.booksService.dropDuplicateStates();
  }

  /**
   * «Вернуть» on a folded book: takes back only its latest decision inside the group — the
   * "not copies" with `otherIds` written by the last tap. One tap is one resolve-many insert
   * (one NOW()); the 5 s window also catches old app versions that sent pairs one by one.
   * Older decisions about the book stay. Returns the pairs that became undecided.
   */
  async unresolveLast(bookId: string, otherIds: string[]) {
    const others = otherIds.filter((id) => id !== bookId);
    if (!others.length) return { pairs: [] };
    // The prod table holds repeated rows for some pairs (no unique index there), so the last
    // tap picks pairs and every row of those pairs goes — a leftover older row would keep the
    // pair resolved.
    const result = await this.dupResRepository.manager.query(
      `WITH mine AS (
         SELECT book1_id, book2_id, resolved_at FROM duplicate_resolutions
         WHERE (book1_id = $1 AND book2_id = ANY($2::uuid[]))
            OR (book2_id = $1 AND book1_id = ANY($2::uuid[]))
       ), last AS (
         SELECT DISTINCT book1_id, book2_id FROM mine
         WHERE resolved_at >= (SELECT max(resolved_at) FROM mine) - interval '5 seconds'
       )
       DELETE FROM duplicate_resolutions r
       USING last
       WHERE r.book1_id = last.book1_id AND r.book2_id = last.book2_id
       RETURNING r.book1_id::text AS "book1Id", r.book2_id::text AS "book2Id"`,
      [bookId, others],
    );
    // TypeORM's postgres driver returns [rows, count] for DELETE … RETURNING
    const rows: Array<{ book1Id: string; book2Id: string }> = Array.isArray(result[0]) ? result[0] : result;
    this.booksService.dropDuplicateStates();
    const pairs = new Map(rows.map((r) => [`${r.book1Id}:${r.book2Id}`, [r.book1Id, r.book2Id] as [string, string]]));
    return { pairs: [...pairs.values()] };
  }

  /**
   * Marks `bookIds` as one copy set. `restBookIds` are the other books of the suspected group
   * when the admin splits it: each selected book is resolved as "not a duplicate" of them.
   * With `overrideResolutions`, earlier "not copies" between the selected books are removed —
   * the admin confirmed they are copies after all.
   */
  async markCopies(
    bookIds: string[],
    masterBookId: string | undefined,
    restBookIds: string[],
    adminId: string,
    overrideResolutions = false,
  ) {
    if (!bookIds.length) return;
    const selected = new Set(bookIds);
    const rest = [...new Set(restBookIds)].filter((id) => !selected.has(id));
    if (rest.length) {
      await this.resolveDuplicates(
        bookIds.flatMap((a) => rest.map((b) => ({ book1Id: a, book2Id: b }))),
        adminId,
      );
    }
    if (overrideResolutions) {
      await this.dupResRepository.manager.query(
        `DELETE FROM duplicate_resolutions WHERE book1_id = ANY($1::uuid[]) AND book2_id = ANY($1::uuid[])`,
        [bookIds],
      );
      this.booksService.dropDuplicateStates();
    }
    const copyGroupId = await this.booksService.markAsCopies(bookIds, masterBookId);
    return { copyGroupId };
  }

  async unmarkCopies(bookIds: string[]) {
    if (!bookIds.length) return { unmarkedIds: [] };
    return { unmarkedIds: await this.booksService.unmarkCopies(bookIds) };
  }

  async addToLibrary(bookId: string, adminId: string) {
    return this.booksService.addToLibrary(bookId, adminId);
  }

  async removeFromLibrary(bookId: string) {
    return this.booksService.removeFromLibrary(bookId);
  }

  async getLibraryBooks(pagination: PaginationDto, filters: { ownerId?: string; search?: string }) {
    return this.booksService.getLibraryBooks(pagination, filters);
  }

  async findCopySets(forBookId: string | undefined, search: string | undefined) {
    return this.booksService.findCopySets(forBookId, search);
  }

  async moveToCopySet(bookId: string, copyGroupId: string, adminId: string) {
    return this.booksService.moveToCopySet(bookId, copyGroupId, adminId);
  }

  async startCopySet(bookId: string, withBookId: string, adminId: string) {
    return this.booksService.startCopySet(bookId, withBookId, adminId);
  }

  async getCopyGroups(dto: {
    page?: number;
    limit?: number;
    search?: string;
    status?: 'published' | 'not_published' | 'archived';
    count?: number;
    operatorId?: string;
    storeId?: string;
    boxId?: string;
  }) {
    const { page, limit, ...filters } = dto;
    return this.booksService.getCopyGroups(page ?? 1, limit ?? 20, filters);
  }
}
