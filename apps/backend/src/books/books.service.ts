import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import { Book } from './entities/book.entity';
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

@Injectable()
export class BooksService {
  private readonly logger = new Logger(BooksService.name);
  private _groupsCache: {
    isbnGroupsRaw: Array<{ isbn: string; ids: unknown }>;
    titleGroupsRaw: Array<{ normalizedTitle: string; ids: unknown }>;
    cachedAt: number;
  } | null = null;
  private _groupsCachePending: Promise<{
    isbnGroupsRaw: Array<{ isbn: string; ids: unknown }>;
    titleGroupsRaw: Array<{ normalizedTitle: string; ids: unknown }>;
  }> | null = null;

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
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.box', 'box')
      .leftJoinAndSelect('book.photos', 'photos')
      .leftJoinAndSelect('book.createdBy', 'createdBy')
      .leftJoinAndSelect('book.ozonProduct', 'ozonProduct');

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
        qb.andWhere('(book.isCopy = false OR book.publishedToOzon IS NOT NULL)');
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

    qb.skip(pagination.skip).take(pagination.limit);

    const [data, total] = await qb.getManyAndCount();

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
      .andWhere('(book.isCopy = false OR book.publishedToOzon IS NOT NULL)')
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
      .andWhere('(book.isCopy = false OR book.publishedToOzon IS NOT NULL)')
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

  async getPendingReviewIds(boxId?: string): Promise<string[]> {
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .leftJoin('book.workSession', 'workSession')
      .select('book.id')
      .where('book.status = :status', { status: BookStatus.PENDING_REVIEW })
      .andWhere("(book.work_session_id IS NULL OR workSession.status = 'completed')")
      .andWhere('(book.isCopy = false OR book.publishedToOzon IS NOT NULL)');

    if (boxId) {
      qb.andWhere('book.box_id = :boxId', { boxId });
    }

    const books = await qb.getMany();
    return books.map((b) => b.id);
  }

  async markAsCopies(bookIds: string[]): Promise<void> {
    await this.booksRepository.update({ id: In(bookIds) }, { isCopy: true });
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
      .where('book.isCopy = true')
      .orderBy('book.createdAt', 'DESC');

    if (filters.status === 'published') {
      qb.andWhere('book.status = :pub', { pub: BookStatus.PUBLISHED });
    } else if (filters.status === 'archived') {
      qb.andWhere('book.status = :arch', { arch: BookStatus.ARCHIVED });
    } else if (filters.status === 'not_published') {
      qb.andWhere('book.status != :pub', { pub: BookStatus.PUBLISHED });
    }

    if (filters.search) {
      qb.andWhere(
        '(book.title ILIKE :s OR book.author ILIKE :s OR book.isbn ILIKE :s)',
        { s: `%${filters.search}%` },
      );
    }

    const books = await qb.getMany();

    const groupMap = new Map<string, { type: 'isbn' | 'title'; key: string; books: Book[] }>();
    for (const book of books) {
      if (book.isbn?.trim()) {
        const gk = `isbn:${book.isbn}`;
        if (!groupMap.has(gk)) groupMap.set(gk, { type: 'isbn', key: book.isbn, books: [] });
        groupMap.get(gk)!.books.push(book);
      } else {
        const normalized = book.title?.toLowerCase().trim() ?? '';
        const gk = `title:${normalized}`;
        if (!groupMap.has(gk)) groupMap.set(gk, { type: 'title', key: book.title ?? '', books: [] });
        groupMap.get(gk)!.books.push(book);
      }
    }

    const allGroups = Array.from(groupMap.values());
    const total = allGroups.length;
    const pageGroups = allGroups.slice((page - 1) * limit, page * limit);

    return { groups: pageGroups, total, page, totalPages: Math.ceil(total / limit) };
  }

  async countCopies(): Promise<number> {
    return this.booksRepository.count({ where: { isCopy: true } });
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
      relations: ['photos', 'box', 'ocrResult', 'ozonProduct', 'createdBy'],
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
    const { boxId, isCopy, isbn, title } = book;
    await this.photosService.deleteAllForBook(id);
    await this.booksRepository.remove(book);
    if (boxId) {
      await this.boxesService.deleteIfEmpty(boxId);
    }
    if (isCopy) {
      await this.unmarkSingletonCopy(isbn, title);
    }
  }

  private async unmarkSingletonCopy(isbn: string | null, title: string): Promise<void> {
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .where('book.isCopy = true');

    if (isbn?.trim()) {
      qb.andWhere('book.isbn = :isbn', { isbn });
    } else {
      qb.andWhere("LOWER(TRIM(book.title)) = LOWER(TRIM(:title))", { title });
    }

    const remaining = await qb.getMany();
    if (remaining.length === 1) {
      await this.booksRepository.update(remaining[0].id, { isCopy: false });
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
    const resolvedSet = new Set(
      resolvedPairs.map((p) => [p.book1Id, p.book2Id].sort().join(':')),
    );

    const parseIds = (raw: unknown): string[] => {
      if (Array.isArray(raw)) return raw as string[];
      if (typeof raw === 'string' && raw.startsWith('{')) {
        return raw.slice(1, -1).split(',').filter(Boolean);
      }
      return raw ? [raw as string] : [];
    };

    const allPairsResolved = (ids: string[]) => {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (!resolvedSet.has([ids[i], ids[j]].sort().join(':'))) return false;
        }
      }
      return true;
    };

    // Step 1: Fetch group keys + IDs (cached for 2 minutes to avoid repeated heavy queries)
    // Promise deduplication: concurrent requests share one in-flight query instead of each spawning their own.
    const CACHE_TTL = 2 * 60 * 1000;
    const now = Date.now();
    let isbnGroupsRaw: Array<{ isbn: string; ids: unknown }>;
    let titleGroupsRaw: Array<{ normalizedTitle: string; ids: unknown }>;

    if (this._groupsCache && now - this._groupsCache.cachedAt < CACHE_TTL) {
      isbnGroupsRaw = this._groupsCache.isbnGroupsRaw;
      titleGroupsRaw = this._groupsCache.titleGroupsRaw;
    } else {
      if (!this._groupsCachePending) {
        this._groupsCachePending = Promise.all([
          this.booksRepository
            .createQueryBuilder('book')
            .select('book.isbn', 'isbn')
            .addSelect('array_agg(book.id)', 'ids')
            .leftJoin('book.workSession', 'ws')
            .where('book.isbn IS NOT NULL')
            .andWhere("book.isbn != ''")
            .andWhere("(book.work_session_id IS NULL OR ws.status = 'completed')")
            .groupBy('book.isbn')
            .having('COUNT(*) >= 2')
            .getRawMany<{ isbn: string; ids: unknown }>(),
          this.booksRepository
            .createQueryBuilder('book')
            .select('LOWER(TRIM(book.title))', 'normalizedTitle')
            .addSelect('array_agg(book.id)', 'ids')
            .leftJoin('book.workSession', 'ws')
            .where("LOWER(TRIM(book.title)) NOT ILIKE :newBook", { newBook: 'новая книга' })
            .andWhere("book.isbn IS NULL OR book.isbn = ''")
            .andWhere("(book.work_session_id IS NULL OR ws.status = 'completed')")
            .groupBy('LOWER(TRIM(book.title))')
            .having('COUNT(*) >= 2')
            .getRawMany<{ normalizedTitle: string; ids: unknown }>(),
        ]).then(([isbnRaw, titleRaw]) => {
          this._groupsCache = { isbnGroupsRaw: isbnRaw, titleGroupsRaw: titleRaw, cachedAt: Date.now() };
          this._groupsCachePending = null;
          this.logger.debug(`[duplicates] cache miss: isbn_groups=${isbnRaw.length} title_groups=${titleRaw.length}`);
          return { isbnGroupsRaw: isbnRaw, titleGroupsRaw: titleRaw };
        }).catch((err) => {
          this._groupsCachePending = null;
          throw err;
        });
      }
      ({ isbnGroupsRaw, titleGroupsRaw } = await this._groupsCachePending);
    }

    // Step 2: Filter resolved, build flat list
    type RawGroup = { type: 'isbn' | 'title'; key: string; ids: string[] };
    const allGroups: RawGroup[] = [];

    for (const g of isbnGroupsRaw) {
      const ids = parseIds(g.ids);
      if (ids.length >= 2 && !allPairsResolved(ids)) {
        allGroups.push({ type: 'isbn', key: g.isbn, ids });
      }
    }
    for (const g of titleGroupsRaw) {
      const ids = parseIds(g.ids);
      if (ids.length >= 2 && !allPairsResolved(ids)) {
        allGroups.push({ type: 'title', key: g.normalizedTitle, ids });
      }
    }

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
              qb.andWhere('book.status != :pub', { pub: BookStatus.PUBLISHED });
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
    const totalPages = Math.ceil(total / limit);
    const pageGroups = filteredGroups.slice((page - 1) * limit, page * limit);

    // Step 3: Bulk-fetch books only for this page (no ocrResult — saves ~500KB/page)
    // Cap books per group to prevent OOM when large groups pass a store/operator filter.
    // When a book-level filter is active, matching books are prioritised so they're always visible.
    const MAX_BOOKS_PER_GROUP = 25;
    const pageIds = [...new Set(
      pageGroups.flatMap((g) => {
        if (g.ids.length <= MAX_BOOKS_PER_GROUP) return g.ids;
        if (matchingBookIds) {
          const matching = g.ids.filter((id) => matchingBookIds!.has(id));
          const others = g.ids.filter((id) => !matchingBookIds!.has(id));
          return [...matching, ...others].slice(0, MAX_BOOKS_PER_GROUP);
        }
        return g.ids.slice(0, MAX_BOOKS_PER_GROUP);
      }),
    )];
    const bookMap = new Map<string, Book>();
    if (pageIds.length > 0) {
      const books = await this.booksRepository.find({
        where: { id: In(pageIds) },
        relations: ['photos', 'box', 'ozonProduct'],
      });
      books.forEach((b) => bookMap.set(b.id, b));
    }

    type GroupResult = { type: 'isbn' | 'title'; key: string; books: Book[]; probability: number; matchedFields: string[] };
    const isbnDuplicates: GroupResult[] = [];
    const possibleDuplicates: GroupResult[] = [];

    // Latin→Cyrillic homoglyph normalization: OCR/operators often mix them visually
    const HOMO: Record<string, string> = { a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у' };
    const norm = (s?: string | null) =>
      (s ?? '')
        .toLowerCase()
        .replace(/ё/g, 'е')
        .replace(/[acoepxy]/g, (ch) => HOMO[ch] ?? ch)
        .replace(/[.,\-–—:;!?«»"'`()\[\]\/\\]/g, ' ')
        .replace(/[  ​‌­﻿]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const calcGroupProbability = (books: Book[], groupType: 'isbn' | 'title') => {
      let bestProb = 0;
      let bestFields: string[] = [];
      for (let i = 0; i < books.length; i++) {
        for (let j = i + 1; j < books.length; j++) {
          const a = books[i];
          const b = books[j];
          const isbnMatch = groupType === 'isbn';
          const na = norm(a?.title); const nb = norm(b?.title);
          const aa = norm(a?.author); const ab = norm(b?.author);
          const titleMatch = !!(na && nb && na === nb);
          const authorMatch = !!(aa && ab && aa === ab);
          const fields: string[] = [];
          if (isbnMatch) fields.push('ISBN');
          if (titleMatch) fields.push('Название');
          if (authorMatch) fields.push('Автор');
          const prob = fields.length >= 3 ? 100 : fields.length === 2 ? 60 : 30;
          if (prob > bestProb) { bestProb = prob; bestFields = fields; }
        }
      }
      if (bestFields.length === 0) {
        bestFields = groupType === 'isbn' ? ['ISBN'] : ['Название'];
        bestProb = 30;
      }
      return { probability: bestProb, matchedFields: bestFields };
    };

    for (const group of pageGroups) {
      const books = group.ids.map((id) => bookMap.get(id)).filter(Boolean) as Book[];
      if (books.length < 2) continue;
      const { probability, matchedFields } = calcGroupProbability(books, group.type);

      if (group.type === 'isbn') {
        isbnDuplicates.push({ type: 'isbn', key: group.key, books, probability, matchedFields });
      } else {
        possibleDuplicates.push({ type: 'title', key: group.key, books, probability, matchedFields });
      }
    }

    return { isbnDuplicates, possibleDuplicates, total, page, totalPages };
  }

  async countDuplicates(): Promise<number> {
    // getCount() strips GROUP BY/HAVING internally — use raw subqueries to count groups
    // Title groups only count books missing ISBN to avoid double-counting isbn+title groups
    const [isbnResult, titleResult] = await Promise.all([
      this.booksRepository.manager.query<[{ cnt: string }]>(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT b.isbn FROM books b
          LEFT JOIN work_sessions ws ON ws.id = b.work_session_id
          WHERE b.isbn IS NOT NULL AND b.isbn != ''
            AND (b.work_session_id IS NULL OR ws.status = 'completed')
          GROUP BY b.isbn HAVING COUNT(*) >= 2
        ) sub
      `),
      this.booksRepository.manager.query<[{ cnt: string }]>(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT LOWER(TRIM(b.title)) FROM books b
          LEFT JOIN work_sessions ws ON ws.id = b.work_session_id
          WHERE LOWER(TRIM(b.title)) NOT ILIKE 'новая книга'
            AND (b.isbn IS NULL OR b.isbn = '')
            AND (b.work_session_id IS NULL OR ws.status = 'completed')
          GROUP BY LOWER(TRIM(b.title)) HAVING COUNT(*) >= 2
        ) sub
      `),
    ]);
    return parseInt(isbnResult[0].cnt, 10) + parseInt(titleResult[0].cnt, 10);
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
