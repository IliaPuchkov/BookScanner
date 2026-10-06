import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { nanoid } from 'nanoid';
import { Book } from './entities/book.entity';
import {
  buildDuplicateCards,
  buildDuplicateGroups,
  DuplicateCard,
  DuplicateGroup,
  MatchRow,
  pairKey,
} from './duplicate-matching';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BoxesService } from '../boxes/boxes.service';
import { StatsService } from '../stats/stats.service';
import { PhotosService } from '../photos/photos.service';
import { SettingsService } from '../settings/settings.service';
import { UserRole, BookStatus } from '@bookscanner/shared';
import {
  DEFAULT_HEIGHT_MM,
  DEFAULT_WEIGHT_G,
  DEFAULT_LANGUAGE,
  DEFAULT_CONDITION,
  DEFAULT_BOOK_TYPE,
  DEFAULT_DIRECTION,
  DEFAULT_PRICE,
} from '@bookscanner/shared';

type DuplicateRow = MatchRow & { isCopy: boolean };
type DuplicateCandidates = { groups: DuplicateGroup[]; rowsById: Map<string, DuplicateRow> };

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);
  private _groupsCache: { candidates: DuplicateCandidates; cachedAt: number } | null = null;
  private _groupsCachePending: Promise<DuplicateCandidates> | null = null;
  private _cardsCache: { candidates: DuplicateCandidates; resolvedCount: number; cards: DuplicateCard[] } | null = null;

  private _filterCache: {
    key: string;
    matchingBookIds: Set<string>;
    cachedAt: number;
  } | null = null;
  private _filterCachePending: Map<string, Promise<Set<string>>> = new Map();

  constructor(
    @InjectRepository(Book)
    private readonly booksRepository: Repository<Book>,
    private readonly boxesService: BoxesService,
    private readonly statsService: StatsService,
    private readonly photosService: PhotosService,
    private readonly settingsService: SettingsService,
  ) {}

  async create(dto: CreateBookDto, userId: string): Promise<Book> {
    const box = await this.boxesService.findOne(dto.boxId);
    const sku = this.generateSku(box.boxNumber);

    const book = this.booksRepository.create({
      ...dto,
      sku,
      createdById: userId,
      language: dto.language || DEFAULT_LANGUAGE,
      condition: DEFAULT_CONDITION,
      bookType: DEFAULT_BOOK_TYPE,
      direction: DEFAULT_DIRECTION,
      price: dto.price ?? DEFAULT_PRICE,
      dimensions: dto.dimensions || { width: 0, height: DEFAULT_HEIGHT_MM, depth: 0 },
      weightGross: dto.weightGross ?? DEFAULT_WEIGHT_G,
      workSessionId: dto.workSessionId || undefined,
    });

    const saved = await this.booksRepository.save(book);
    await this.statsService.logActivity(userId, 'card_created', 'book', saved.id);
    return saved;
  }

  async findAll(
    userId: string,
    role: UserRole,
    pagination: PaginationDto,
    boxId?: string,
    search?: string,
    createdById?: string,
    dateFrom?: string,
    dateTo?: string,
    workSessionId?: string,
    status?: BookStatus,
    priceMin?: string,
    priceMax?: string,
    yearFrom?: string,
    yearTo?: string,
    printRunMin?: string,
    printRunMax?: string,
  ) {
    // Paged in two steps: this query picks the page of book ids using only
    // to-one joins, then the relations are loaded for those ids alone.
    // Joining photos (one-to-many) here would make TypeORM wrap skip/take in a
    // SELECT DISTINCT over the whole books×photos join, sorted by boxNumber —
    // that got slower with every page and eventually timed out.
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .leftJoin('book.box', 'box');

    if (role !== UserRole.ADMIN || workSessionId) {
      // Operators always see only their own books.
      // Admins querying a specific session (operator mode) also see only their own books.
      qb.andWhere('book.created_by = :userId', { userId });
    } else {
      // Admin browsing all books (no session filter): only completed/sessionless books
      qb.leftJoin('book.workSession', 'workSession')
        .andWhere(
          "(book.work_session_id IS NULL OR workSession.status = 'completed')",
        );
    }

    if (boxId) {
      qb.andWhere('book.box_id = :boxId', { boxId });
    }

    if (createdById) {
      qb.andWhere('book.created_by = :createdById', { createdById });
    }

    if (dateFrom) {
      qb.andWhere('book.createdAt >= :dateFrom', { dateFrom });
    }

    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      qb.andWhere('book.createdAt <= :dateTo', { dateTo: to.toISOString() });
    }

    if (workSessionId) {
      qb.andWhere('book.work_session_id = :workSessionId', { workSessionId });
    }

    if (status) {
      qb.andWhere('book.status = :status', { status });
      if (status === BookStatus.PENDING_REVIEW) {
        qb.andWhere('(book.isCopy = false OR book.isCopyMaster = true OR book.publishedToOzon IS NOT NULL)');
      }
    }

    if (search) {
      qb.andWhere(
        '(book.title ILIKE :search OR book.author ILIKE :search OR book.isbn ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (priceMin !== undefined) {
      qb.andWhere('book.price >= :priceMin', { priceMin: parseFloat(priceMin) });
    }

    if (priceMax !== undefined) {
      qb.andWhere('book.price <= :priceMax', { priceMax: parseFloat(priceMax) });
    }

    if (yearFrom !== undefined) {
      qb.andWhere('book.yearPublished >= :yearFrom', { yearFrom: parseInt(yearFrom, 10) });
    }

    if (yearTo !== undefined) {
      qb.andWhere('book.yearPublished <= :yearTo', { yearTo: parseInt(yearTo, 10) });
    }

    if (printRunMin !== undefined) {
      qb.andWhere('book.printRun >= :printRunMin', { printRunMin: parseInt(printRunMin, 10) });
    }

    if (printRunMax !== undefined) {
      qb.andWhere('book.printRun <= :printRunMax', { printRunMax: parseInt(printRunMax, 10) });
    }

    // For admin queries (no session filter), sort by box first so all books
    // of the same box appear consecutively across pages.
    if (role === UserRole.ADMIN && !workSessionId) {
      qb.orderBy('box.boxNumber', 'ASC', 'NULLS LAST')
        .addOrderBy('book.createdAt', pagination.order);
    } else {
      qb.orderBy('book.createdAt', pagination.order);
    }
    // Unique tie-breaker so offset pages never overlap or skip rows
    qb.addOrderBy('book.id', 'ASC');

    // offset/limit (not skip/take) is safe: only to-one joins, so one row per book.
    qb.offset(pagination.skip).limit(pagination.limit);

    const [pageBooks, total] = await qb.getManyAndCount();

    const ids = pageBooks.map((b) => b.id);
    const loaded = ids.length
      ? await this.booksRepository.find({
          where: { id: In(ids) },
          relations: {
            box: true,
            photos: true,
            createdBy: true,
            ozonProduct: true,
            libraryOwner: true,
          },
        })
      : [];
    const byId = new Map(loaded.map((b) => [b.id, b]));
    const data = ids
      .map((id) => byId.get(id))
      .filter((b): b is Book => b !== undefined);

    return {
      data,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async countCreatedSince(since?: Date, until?: Date, excludeOzonImport = false): Promise<number> {
    const qb = this.booksRepository.createQueryBuilder('book');
    if (excludeOzonImport) {
      qb.innerJoin('book.box', 'box')
        .where('box.boxNumber != :importBox', { importBox: 'OZON_IMPORT' });
    }
    if (since) {
      qb.andWhere('book.createdAt >= :since', { since });
    }
    if (until) {
      qb.andWhere('book.createdAt <= :until', { until });
    }
    return qb.getCount();
  }

  async getPerUserBookCounts(since?: Date, until?: Date, includeActiveSessions = false): Promise<Array<{ userId: string; fullName: string; completedCount: string; activeCount: string }>> {
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .innerJoin('book.createdBy', 'user')
      .innerJoin('book.box', 'box')
      .leftJoin('book.workSession', 'workSession')
      .select('user.id', 'userId')
      .addSelect('user.fullName', 'fullName')
      .addSelect(
        "COUNT(CASE WHEN book.work_session_id IS NULL OR workSession.status = 'completed' THEN 1 END)",
        'completedCount',
      )
      .addSelect(
        "COUNT(CASE WHEN workSession.status != 'completed' AND book.work_session_id IS NOT NULL THEN 1 END)",
        'activeCount',
      )
      .where('box.boxNumber != :importBox', { importBox: 'OZON_IMPORT' })
      .groupBy('user.id')
      .addGroupBy('user.fullName');

    if (since) {
      qb.andWhere('book.createdAt >= :since', { since });
    }
    if (until) {
      qb.andWhere('book.createdAt <= :until', { until });
    }

    const rows = await qb.getRawMany();

    return rows
      .filter((r) => includeActiveSessions
        ? parseInt(r.completedCount, 10) + parseInt(r.activeCount, 10) > 0
        : parseInt(r.completedCount, 10) > 0,
      )
      .sort((a, b) => {
        const totalA = parseInt(a.completedCount, 10) + (includeActiveSessions ? parseInt(a.activeCount, 10) : 0);
        const totalB = parseInt(b.completedCount, 10) + (includeActiveSessions ? parseInt(b.activeCount, 10) : 0);
        return totalB - totalA;
      });
  }

  async countPendingReview(): Promise<number> {
    return this.booksRepository
      .createQueryBuilder('book')
      .leftJoin('book.workSession', 'workSession')
      .where('book.status = :status', { status: BookStatus.PENDING_REVIEW })
      .andWhere(
        "(book.work_session_id IS NULL OR workSession.status = 'completed')",
      )
      .andWhere('(book.isCopy = false OR book.isCopyMaster = true OR book.publishedToOzon IS NOT NULL)')
      .getCount();
  }

  async countPendingReviewByBox(): Promise<Array<{ boxId: string; boxNumber: string; count: number }>> {
    const raw = await this.booksRepository
      .createQueryBuilder('book')
      .innerJoin('book.box', 'box')
      .leftJoin('book.workSession', 'workSession')
      .select('box.id', 'boxId')
      .addSelect('box.boxNumber', 'boxNumber')
      .addSelect('COUNT(*)', 'count')
      .where('book.status = :status', { status: BookStatus.PENDING_REVIEW })
      .andWhere("(book.work_session_id IS NULL OR workSession.status = 'completed')")
      .andWhere('(book.isCopy = false OR book.isCopyMaster = true OR book.publishedToOzon IS NOT NULL)')
      .groupBy('box.id')
      .addGroupBy('box.boxNumber')
      .getRawMany();
    return raw.map((r) => ({ boxId: r.boxId, boxNumber: r.boxNumber, count: parseInt(r.count, 10) }));
  }

  async getFailedPublicationBooks(pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.box', 'box')
      .leftJoinAndSelect('book.photos', 'photos')
      .leftJoinAndSelect('book.createdBy', 'createdBy')
      .leftJoinAndSelect('book.ozonProduct', 'ozonProduct')
      .where('book.status = :status', { status: BookStatus.PUBLICATION_FAILED })
      .orderBy('book.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
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
  ): Promise<string[]> {
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .leftJoin('book.workSession', 'workSession')
      .select('book.id')
      .where('book.status = :status', { status: BookStatus.PENDING_REVIEW })
      .andWhere("(book.work_session_id IS NULL OR workSession.status = 'completed')")
      .andWhere('(book.isCopy = false OR book.isCopyMaster = true OR book.publishedToOzon IS NOT NULL)');

    if (boxId) {
      qb.andWhere('book.box_id = :boxId', { boxId });
    }

    if (filters) {
      const { search, createdById, dateFrom, dateTo, priceMin, priceMax, yearFrom, yearTo, printRunMin, printRunMax } = filters;
      if (createdById) qb.andWhere('book.created_by = :createdById', { createdById });
      if (dateFrom) qb.andWhere('book.createdAt >= :dateFrom', { dateFrom });
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        qb.andWhere('book.createdAt <= :dateTo', { dateTo: to.toISOString() });
      }
      if (search) qb.andWhere('(book.title ILIKE :search OR book.author ILIKE :search OR book.isbn ILIKE :search)', { search: `%${search}%` });
      if (priceMin) qb.andWhere('book.price >= :priceMin', { priceMin: parseFloat(priceMin) });
      if (priceMax) qb.andWhere('book.price <= :priceMax', { priceMax: parseFloat(priceMax) });
      if (yearFrom) qb.andWhere('book.yearPublished >= :yearFrom', { yearFrom: parseInt(yearFrom, 10) });
      if (yearTo) qb.andWhere('book.yearPublished <= :yearTo', { yearTo: parseInt(yearTo, 10) });
      if (printRunMin) qb.andWhere('book.printRun >= :printRunMin', { printRunMin: parseInt(printRunMin, 10) });
      if (printRunMax) qb.andWhere('book.printRun <= :printRunMax', { printRunMax: parseInt(printRunMax, 10) });
    }

    const books = await qb.getMany();
    return books.map((b) => b.id);
  }

  async markAsCopies(bookIds: string[], masterBookId?: string): Promise<void> {
    // Join an existing copy set if any of these books already belongs to one; books of other
    // existing sets touched here are merged into it.
    const existing = await this.booksRepository.find({
      select: ['id', 'copyGroupId', 'isCopy'],
      where: { id: In(bookIds) },
    });
    const oldGroupIds = [...new Set(existing.map((b) => b.copyGroupId).filter((g): g is string => !!g))];
    const copyGroupId = oldGroupIds[0] ?? randomUUID();
    if (oldGroupIds.length > 1) {
      await this.booksRepository.update({ copyGroupId: In(oldGroupIds.slice(1)) }, { copyGroupId });
    }
    await this.booksRepository.update({ id: In(bookIds) }, { isCopy: true, copyGroupId });
    if (masterBookId) {
      // An explicit choice replaces whatever main copy the set had
      await this.booksRepository.update({ copyGroupId }, { isCopyMaster: false });
      await this.booksRepository.update({ id: masterBookId }, { isCopyMaster: true });
    } else {
      // New arrivals join as plain copies; books already in the set keep their role
      const newIds = existing.filter((b) => !b.isCopy).map((b) => b.id);
      if (newIds.length) await this.booksRepository.update({ id: In(newIds) }, { isCopyMaster: false });
    }
    this._groupsCache = null;
  }

  async unmarkCopies(bookIds: string[]): Promise<void> {
    if (!bookIds.length) return;
    await this.booksRepository.update(
      { id: In(bookIds) },
      { isCopy: false, isCopyMaster: false, copyGroupId: null },
    );
    this._groupsCache = null;
  }

  async getCopyGroups(
    page: number,
    limit: number,
    filters: { search?: string; status?: 'published' | 'not_published' | 'archived' } = {},
  ) {
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.photos', 'photos')
      .leftJoinAndSelect('book.box', 'box')
      .leftJoinAndSelect('book.createdBy', 'createdBy')
      .leftJoinAndSelect('book.ozonProduct', 'ozonProduct')
      .leftJoinAndSelect('book.libraryOwner', 'libraryOwner')
      .where('book.isCopy = true')
      .orderBy('book.createdAt', 'DESC');

    const books = await qb.getMany();

    // Grouped by copy set (every copy has one since migration 1747800000000); `id` is the unique
    // group key, `type`/`key` are only for display. A copy without a set shows on its own.
    const groupMap = new Map<string, { id: string; type: 'isbn' | 'title'; key: string; books: Book[] }>();
    for (const book of books) {
      const isbn = book.isbn?.trim();
      const gk = `set:${book.copyGroupId ?? book.id}`;
      if (!groupMap.has(gk)) {
        groupMap.set(gk, isbn
          ? { id: gk, type: 'isbn', key: book.isbn, books: [] }
          : { id: gk, type: 'title', key: book.title ?? '', books: [] });
      }
      groupMap.get(gk)!.books.push(book);
    }

    // Status/search pick whole groups: a group is listed when at least one of its books matches,
    // and it keeps all its books with the matching ones first — so "На Ozon" shows each set with
    // its published copies in front instead of a lone published book.
    const search = filters.search?.trim().toLowerCase();
    const matches = (b: Book) => {
      if (filters.status === 'published' && b.status !== BookStatus.PUBLISHED) return false;
      if (filters.status === 'archived' && b.status !== BookStatus.ARCHIVED) return false;
      if (
        filters.status === 'not_published' &&
        (b.status === BookStatus.PUBLISHED || b.status === BookStatus.ARCHIVED)
      ) return false;
      if (search && ![b.title, b.author, b.isbn].some((f) => f?.toLowerCase().includes(search))) return false;
      return true;
    };
    if (filters.status || search) {
      for (const [gk, g] of groupMap) {
        const hit = g.books.filter(matches);
        if (!hit.length) groupMap.delete(gk);
        else g.books = [...hit, ...g.books.filter((b) => !hit.includes(b))];
      }
    }

    const allGroups = Array.from(groupMap.values());
    const total = allGroups.length;
    const totalBooks = allGroups.reduce((n, g) => n + g.books.length, 0);
    const pageGroups = allGroups.slice((page - 1) * limit, page * limit);

    return { groups: pageGroups, total, totalBooks, page, totalPages: Math.ceil(total / limit) };
  }

  async countCopies(): Promise<number> {
    return this.booksRepository.count({ where: { isCopy: true } });
  }

  // "Домашняя книга": an admin takes a pending-review book into their own collection.
  // Status IN_LIBRARY removes it from the review queue and blocks Ozon publication.
  async addToLibrary(id: string, adminId: string): Promise<Book> {
    const result = await this.booksRepository
      .createQueryBuilder()
      .update(Book)
      .set({ status: BookStatus.IN_LIBRARY, libraryOwnerId: adminId, addedToLibraryAt: () => 'NOW()' })
      .where('id = :id', { id })
      .andWhere('status = :status', { status: BookStatus.PENDING_REVIEW })
      .andWhere('"publishedToOzon" IS NULL')
      .execute();
    if (!result.affected) {
      await this.findOne(id); // 404 if missing
      throw new BadRequestException('В библиотеку можно добавить только неопубликованную книгу на проверке.');
    }
    return this.findOne(id);
  }

  async removeFromLibrary(id: string): Promise<Book> {
    const result = await this.booksRepository.update(
      { id, status: BookStatus.IN_LIBRARY },
      { status: BookStatus.PENDING_REVIEW, libraryOwnerId: null, addedToLibraryAt: null },
    );
    if (!result.affected) {
      await this.findOne(id);
      throw new BadRequestException('Книга не находится в библиотеке.');
    }
    return this.findOne(id);
  }

  async getLibraryBooks(pagination: PaginationDto, filters: { ownerId?: string; search?: string } = {}) {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.photos', 'photos')
      .leftJoinAndSelect('book.box', 'box')
      .leftJoinAndSelect('book.libraryOwner', 'libraryOwner')
      .where('book.status = :status', { status: BookStatus.IN_LIBRARY })
      .orderBy('book.addedToLibraryAt', 'DESC')
      .addOrderBy('book.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);
    if (filters.ownerId) {
      qb.andWhere('book.libraryOwnerId = :ownerId', { ownerId: filters.ownerId });
    }
    if (filters.search) {
      qb.andWhere(
        '(book.title ILIKE :s OR book.author ILIKE :s OR book.isbn ILIKE :s)',
        { s: `%${filters.search}%` },
      );
    }
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async countLibrary(): Promise<number> {
    return this.booksRepository.count({ where: { status: BookStatus.IN_LIBRARY } });
  }

  async countByBox(userId: string, role: UserRole, workSessionId?: string): Promise<Array<{ boxId: string; boxNumber: string; count: number }>> {
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .innerJoin('book.box', 'box')
      .select('box.id', 'boxId')
      .addSelect('box.boxNumber', 'boxNumber')
      .addSelect('COUNT(*)', 'count')
      .groupBy('box.id')
      .addGroupBy('box.boxNumber');

    if (role !== UserRole.ADMIN) {
      qb.where('book.created_by = :userId', { userId });
    }

    if (workSessionId) {
      qb.andWhere('book.work_session_id = :workSessionId', { workSessionId });
    }

    const raw = await qb.getRawMany();
    return raw.map((r) => ({ boxId: r.boxId, boxNumber: r.boxNumber, count: parseInt(r.count, 10) }));
  }

  async findOne(id: string): Promise<Book> {
    const book = await this.booksRepository.findOne({
      where: { id },
      relations: ['photos', 'box', 'ocrResult', 'ozonProduct', 'createdBy', 'libraryOwner'],
    });
    if (!book) {
      throw new NotFoundException('Книга не найдена');
    }
    return book;
  }

  async update(id: string, dto: UpdateBookDto, userId: string, role: UserRole): Promise<Book> {
    const book = await this.findOne(id);
    this.checkOwnership(book, userId, role);
    const clean = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    );
    if (dto.price !== undefined && Number(dto.price) !== Number(book.price)) {
      (clean as any).priceReviewed = true;
    }
    Object.assign(book, clean);
    return this.booksRepository.save(book);
  }

  async updateFromExtraction(id: string, data: Partial<Book>): Promise<void> {
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== null && v !== undefined),
    );
    if (Object.keys(clean).length === 0) {
      this.logger.warn(`updateFromExtraction: no data to write for book ${id}`);
      return;
    }

    const book = await this.booksRepository.findOne({ where: { id } });
    if (!book) {
      this.logger.error(`updateFromExtraction: book ${id} not found`);
      return;
    }

    this.logger.log(`updateFromExtraction: writing fields [${Object.keys(clean).join(', ')}] to book ${id}`);
    Object.assign(book, clean);
    await this.booksRepository.save(book);
  }

  async createWithPhotos(
    dto: CreateBookDto,
    files: Express.Multer.File[],
    userId: string,
  ): Promise<Book> {
    if (!files || files.length < 2) {
      throw new BadRequestException(
        'Необходимо минимум 2 фотографии (обложка и страница с информацией)',
      );
    }

    const book = await this.create(dto, userId);

    try {
      await this.photosService.upload(book.id, files);
    } catch (err) {
      await this.photosService.deleteAllForBook(book.id).catch(() => {});
      await this.booksRepository.remove(book);
      throw err;
    }

    return this.findOne(book.id);
  }

  async remove(id: string, userId: string, role: UserRole): Promise<void> {
    const book = await this.findOne(id);
    this.checkOwnership(book, userId, role);
    const { boxId, isCopy, copyGroupId } = book;
    await this.photosService.deleteAllForBook(id);
    await this.booksRepository.remove(book);
    if (boxId) {
      await this.boxesService.deleteIfEmpty(boxId);
    }
    if (isCopy) {
      await this.unmarkSingletonCopy(copyGroupId);
    }
  }

  // A copy set left with one book is no longer a set: that book becomes an ordinary book again
  private async unmarkSingletonCopy(copyGroupId: string | null): Promise<void> {
    if (!copyGroupId) return;
    const remaining = await this.booksRepository.find({
      select: ['id'],
      where: { isCopy: true, copyGroupId },
    });
    if (remaining.length === 1) {
      await this.booksRepository.update(remaining[0].id, {
        isCopy: false,
        isCopyMaster: false,
        copyGroupId: null,
      });
      this._groupsCache = null;
    }
  }

  async getOcrFailedBooks(pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .leftJoin('book.ocrResult', 'ocrResult')
      .leftJoinAndSelect('book.photos', 'photos')
      .leftJoinAndSelect('book.box', 'box')
      .where("LOWER(TRIM(book.title)) = :title", { title: 'новая книга' })
      .andWhere('ocrResult.id IS NULL')
      .andWhere('book.status != :archived', { archived: 'archived' })
      .orderBy('book.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async countOcrFailed(): Promise<number> {
    return this.booksRepository
      .createQueryBuilder('book')
      .leftJoin('book.ocrResult', 'ocrResult')
      .where("LOWER(TRIM(book.title)) = :title", { title: 'новая книга' })
      .andWhere('ocrResult.id IS NULL')
      .andWhere('book.status != :archived', { archived: 'archived' })
      .getCount();
  }

  private async buildRareBooksQuery() {
    const [maxYear, maxPrintRun, minYear, minPrice, maxPrice, selectedStores, includePendingReview] =
      await Promise.all([
        this.settingsService.getValue<number>('rare_book_max_year', 1985),
        this.settingsService.getValue<number>('rare_book_max_print_run', 10000),
        this.settingsService.getValue<number>('rare_book_min_year', 0),
        this.settingsService.getValue<number>('rare_book_min_price', 0),
        this.settingsService.getValue<number>('rare_book_max_price', 0),
        this.settingsService.getValue<string[]>('rare_book_selected_stores', []),
        this.settingsService.getValue<boolean>('rare_book_include_pending_review', true),
      ]);

    const qb = this.booksRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.photos', 'photos')
      .leftJoinAndSelect('book.box', 'box')
      .leftJoinAndSelect('book.ozonProduct', 'ozonProduct')
      .leftJoinAndSelect('book.libraryOwner', 'libraryOwner')
      .where('book.yearPublished <= :maxYear', { maxYear })
      .andWhere('book.printRun IS NOT NULL')
      .andWhere('book.printRun < :maxPrintRun', { maxPrintRun })
      .andWhere('book.status != :archived', { archived: 'archived' })
      .andWhere('book.priceReviewed = false');

    if (minYear > 0) {
      qb.andWhere('book.yearPublished >= :minYear', { minYear });
    }
    if (minPrice > 0) {
      qb.andWhere('book.price >= :minPrice', { minPrice });
    }
    if (maxPrice > 0) {
      qb.andWhere('book.price <= :maxPrice', { maxPrice });
    }

    // Store filter: only apply when user explicitly configured it
    const storeFilterActive = selectedStores.length > 0 || !includePendingReview;
    if (storeFilterActive) {
      const conditions: string[] = [];
      const params: Record<string, unknown> = {};
      if (selectedStores.length > 0) {
        conditions.push('ozonProduct.storeId IN (:...filterStoreIds)');
        params.filterStoreIds = selectedStores;
      }
      if (includePendingReview) {
        conditions.push('book.status = :pendingReviewStatus');
        params.pendingReviewStatus = BookStatus.PENDING_REVIEW;
      }
      if (conditions.length > 0) {
        qb.andWhere(`(${conditions.join(' OR ')})`, params);
      }
    }

    return qb;
  }

  async getUnderpricedBooks(pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const qb = await this.buildRareBooksQuery();
    qb.orderBy('book.printRun', 'ASC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async countUnderpriced(): Promise<number> {
    const qb = await this.buildRareBooksQuery();
    return qb.getCount();
  }

  async countOzonFailed(): Promise<number> {
    return this.booksRepository
      .createQueryBuilder('book')
      .where('book.status = :status', { status: BookStatus.PUBLICATION_FAILED })
      .getCount();
  }

  async getDuplicatePairs(
    resolvedPairs: Array<{ book1Id: string; book2Id: string }>,
    filters: { search?: string; status?: string; count?: number; operatorId?: string; storeId?: string; boxId?: string } = {},
    page = 1,
    limit = 20,
  ) {
    // Step 1-2: the cards the screen shows (split by resolutions, confirmed sets and Low
    // probability dropped) — built before paging so total/totalPages count real cards.
    const now = Date.now();
    const allGroups = await this.getDuplicateCards(resolvedPairs);

    // Step 2.5: Server-side filtering
    // Build a set of book IDs matching all book-level filter criteria, then keep only groups
    // where at least one book ID is in that set.
    const hasBookFilter = filters.search || filters.status || filters.operatorId || filters.storeId || filters.boxId;
    let matchingBookIds: Set<string> | null = null;

    if (hasBookFilter) {
      const FILTER_CACHE_TTL = 60 * 1000;
      const filterKey = JSON.stringify({
        search: filters.search ?? '',
        status: filters.status ?? '',
        operatorId: filters.operatorId ?? '',
        storeId: filters.storeId ?? '',
        boxId: filters.boxId ?? '',
      });

      if (
        this._filterCache &&
        this._filterCache.key === filterKey &&
        now - this._filterCache.cachedAt < FILTER_CACHE_TTL
      ) {
        matchingBookIds = this._filterCache.matchingBookIds;
      } else if (this._filterCachePending.has(filterKey)) {
        matchingBookIds = await this._filterCachePending.get(filterKey)!;
      } else {
        const pending = (async () => {
          try {
            const qb = this.booksRepository
              .createQueryBuilder('book')
              .select('book.id', 'id')
              .where('1 = 1');

            if (filters.status === 'published') {
              qb.andWhere('book.status = :pub', { pub: BookStatus.PUBLISHED });
            } else if (filters.status === 'archived') {
              qb.andWhere('book.status = :arch', { arch: BookStatus.ARCHIVED });
            } else if (filters.status === 'not_published') {
              qb.andWhere('book.status NOT IN (:...excl)', { excl: [BookStatus.PUBLISHED, BookStatus.ARCHIVED] });
            }

            if (filters.search) {
              const s = `%${filters.search.toLowerCase()}%`;
              qb.andWhere(
                '(LOWER(book.title) LIKE :s OR LOWER(book.author) LIKE :s)',
                { s },
              );
            }

            if (filters.operatorId) {
              qb.andWhere('book.created_by = :operatorId', { operatorId: filters.operatorId });
            }

            if (filters.boxId) {
              qb.andWhere('book.box_id = :boxId', { boxId: filters.boxId });
            }

            if (filters.storeId) {
              qb.innerJoin('book.ozonProduct', 'op')
                .andWhere('op.storeId = :storeId', { storeId: filters.storeId });
            }

            const rows = await qb.getRawMany<{ id: string }>();
            const ids = new Set(rows.map((r) => r.id));
            this._filterCache = { key: filterKey, matchingBookIds: ids, cachedAt: Date.now() };
            return ids;
          } finally {
            this._filterCachePending.delete(filterKey);
          }
        })();

        this._filterCachePending.set(filterKey, pending);
        matchingBookIds = await pending;
      }
    }

    const filteredGroups = allGroups.filter((group) => {
      // Count filter: 4 means "4 or more"
      if (filters.count) {
        if (filters.count >= 4) {
          if (group.ids.length < 4) return false;
        } else {
          if (group.ids.length !== filters.count) return false;
        }
      }
      // Book-level filter: at least one book in the group must match
      if (matchingBookIds && !group.ids.some((id) => matchingBookIds!.has(id))) return false;
      return true;
    });

    const total = filteredGroups.length;
    // A book on two cards (merge blocked by an OCR'd author) is counted once
    const totalBooks = new Set(filteredGroups.flatMap((g) => g.ids)).size;
    const totalPages = Math.ceil(total / limit);
    const pageGroups = filteredGroups.slice((page - 1) * limit, page * limit);

    // Step 3: Bulk-fetch books only for this page (no ocrResult — saves ~500KB/page)
    // Cap books per group to prevent OOM when large groups pass a store/operator filter.
    // When a book-level filter is active, matching books are prioritised so they're always visible.
    const MAX_BOOKS_PER_GROUP = 25;
    const shownIds = (g: DuplicateCard) => {
      if (g.ids.length <= MAX_BOOKS_PER_GROUP) return g.ids;
      if (matchingBookIds) {
        const matching = g.ids.filter((id) => matchingBookIds!.has(id));
        const others = g.ids.filter((id) => !matchingBookIds!.has(id));
        return [...matching, ...others].slice(0, MAX_BOOKS_PER_GROUP);
      }
      return g.ids.slice(0, MAX_BOOKS_PER_GROUP);
    };
    const pageIds = [...new Set(pageGroups.flatMap(shownIds))];
    const bookMap = new Map<string, Book>();
    if (pageIds.length > 0) {
      const books = await this.booksRepository.find({
        where: { id: In(pageIds) },
        relations: ['photos', 'box', 'ozonProduct', 'libraryOwner'],
      });
      books.forEach((b) => bookMap.set(b.id, b));
    }

    type GroupResult = { type: 'isbn' | 'title'; key: string; authorKey?: string; componentKey?: string; books: Book[]; probability: number; matchedFields: string[] };
    const isbnDuplicates: GroupResult[] = [];
    const possibleDuplicates: GroupResult[] = [];
    for (const card of pageGroups) {
      const books = shownIds(card).map((id) => bookMap.get(id)).filter(Boolean) as Book[];
      if (books.length < 2) continue; // deleted since the 2-min cache was built
      const { ids: _ids, ...rest } = card;
      (card.type === 'isbn' ? isbnDuplicates : possibleDuplicates).push({ ...rest, books });
    }

    return { isbnDuplicates, possibleDuplicates, total, totalBooks, page, totalPages };
  }

  /** Dashboard count — the same cards the Duplicates screen lists without filters. */
  async countDuplicates(resolvedPairs: Array<{ book1Id: string; book2Id: string }>): Promise<number> {
    return (await this.getDuplicateCards(resolvedPairs)).length;
  }

  // Building cards takes ~200 ms, so reuse them until the candidate groups are rebuilt or a
  // resolution is added (resolutions are only ever inserted; deletes cascade from a book
  // delete, which drops the groups cache anyway).
  private async getDuplicateCards(resolvedPairs: Array<{ book1Id: string; book2Id: string }>) {
    const candidates = await this.getDuplicateGroups();
    const c = this._cardsCache;
    if (c && c.candidates === candidates && c.resolvedCount === resolvedPairs.length) return c.cards;
    const resolved = new Set(resolvedPairs.map((p) => pairKey(p.book1Id, p.book2Id)));
    const cards = buildDuplicateCards(candidates.groups, candidates.rowsById, resolved);
    this._cardsCache = { candidates, resolvedCount: resolvedPairs.length, cards };
    return cards;
  }

  /**
   * Candidate duplicate groups among books outside active work sessions.
   * Grouping happens in JS (not SQL GROUP BY) so it can use ISBN checksum validation and
   * fuzzy author matching — see buildDuplicateGroups in duplicate-matching.ts.
   * Cached for 2 minutes (dropped on mark/unmark copies and delete); concurrent callers share
   * one in-flight query.
   */
  private async getDuplicateGroups(): Promise<DuplicateCandidates> {
    const CACHE_TTL = 2 * 60 * 1000;
    if (this._groupsCache && Date.now() - this._groupsCache.cachedAt < CACHE_TTL) {
      return this._groupsCache.candidates;
    }
    if (!this._groupsCachePending) {
      this._groupsCachePending = this.booksRepository.manager
        .query<DuplicateRow[]>(`
          SELECT book.id::text AS id, book.isbn, book.title, book.author, book."isCopy"
          FROM books book
          LEFT JOIN work_sessions ws ON ws.id = book.work_session_id
          WHERE book.work_session_id IS NULL OR ws.status = 'completed'
        `)
        .then((rows) => {
          const candidates = { groups: buildDuplicateGroups(rows), rowsById: new Map(rows.map((r) => [r.id, r])) };
          this._groupsCache = { candidates, cachedAt: Date.now() };
          this.logger.debug(`[duplicates] cache miss: books=${rows.length} groups=${candidates.groups.length}`);
          return candidates;
        })
        .finally(() => {
          this._groupsCachePending = null;
        });
    }
    return this._groupsCachePending;
  }

  private generateSku(boxNumber: string): string {
    return `${boxNumber}_${nanoid(6).toUpperCase()}`;
  }

  private checkOwnership(book: Book, userId: string, role: UserRole) {
    if (role !== UserRole.ADMIN && book.createdById !== userId) {
      throw new ForbiddenException('Нет доступа к этой книге');
    }
  }
}
