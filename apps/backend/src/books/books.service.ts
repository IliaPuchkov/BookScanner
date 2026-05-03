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
      .andWhere("(book.work_session_id IS NULL OR workSession.status = 'completed')");

    if (boxId) {
      qb.andWhere('book.box_id = :boxId', { boxId });
    }

    const books = await qb.getMany();
    return books.map((b) => b.id);
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
    const boxId = book.boxId;
    await this.photosService.deleteAllForBook(id);
    await this.booksRepository.remove(book);
    if (boxId) {
      await this.boxesService.deleteIfEmpty(boxId);
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

  async getUnderpricedBooks(pagination: PaginationDto) {
    const { page = 1, limit = 20 } = pagination;
    const [maxYear, maxPrintRun] = await Promise.all([
      this.settingsService.getValue<number>('rare_book_max_year', 1985),
      this.settingsService.getValue<number>('rare_book_max_print_run', 10000),
    ]);
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.photos', 'photos')
      .leftJoinAndSelect('book.box', 'box')
      .leftJoinAndSelect('book.ozonProduct', 'ozonProduct')
      .where('book.yearPublished <= :year', { year: maxYear })
      .andWhere('book.printRun IS NOT NULL')
      .andWhere('book.printRun < :printRun', { printRun: maxPrintRun })
      .andWhere('book.status != :archived', { archived: 'archived' })
      .andWhere('book.priceReviewed = false')
      .orderBy('book.printRun', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async countUnderpriced(): Promise<number> {
    const [maxYear, maxPrintRun] = await Promise.all([
      this.settingsService.getValue<number>('rare_book_max_year', 1985),
      this.settingsService.getValue<number>('rare_book_max_print_run', 10000),
    ]);
    return this.booksRepository
      .createQueryBuilder('book')
      .where('book.yearPublished <= :year', { year: maxYear })
      .andWhere('book.printRun IS NOT NULL')
      .andWhere('book.printRun < :printRun', { printRun: maxPrintRun })
      .andWhere('book.status != :archived', { archived: 'archived' })
      .andWhere('book.priceReviewed = false')
      .getCount();
  }

  async countOzonFailed(): Promise<number> {
    return this.booksRepository
      .createQueryBuilder('book')
      .where('book.status = :status', { status: BookStatus.PUBLICATION_FAILED })
      .getCount();
  }

  async getDuplicatePairs(
    resolvedPairs: Array<{ book1Id: string; book2Id: string }>,
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

    // Step 1: Fetch group keys + IDs — 4 parallel queries
    // allTitles/allAuthors are used only for probability scoring (not for building groups)
    const [isbnGroupsRaw, titleGroupsRaw, allTitlesRaw, allAuthorsRaw] = await Promise.all([
      this.booksRepository
        .createQueryBuilder('book')
        .select('book.isbn', 'isbn')
        .addSelect('array_agg(book.id)', 'ids')
        .where('book.isbn IS NOT NULL')
        .andWhere("book.isbn != ''")
        .andWhere('book.status != :archived', { archived: 'archived' })
        .groupBy('book.isbn')
        .having('COUNT(*) >= 2')
        .getRawMany<{ isbn: string; ids: unknown }>(),
      this.booksRepository
        .createQueryBuilder('book')
        .select('LOWER(TRIM(book.title))', 'normalizedTitle')
        .addSelect('array_agg(book.id)', 'ids')
        .where("LOWER(TRIM(book.title)) NOT ILIKE :newBook", { newBook: 'новая книга' })
        .andWhere('book.status != :archived', { archived: 'archived' })
        .andWhere("book.isbn IS NULL OR book.isbn = ''")
        .groupBy('LOWER(TRIM(book.title))')
        .having('COUNT(*) >= 2')
        .getRawMany<{ normalizedTitle: string; ids: unknown }>(),
      // All-books title grouping for probability (includes isbn books)
      this.booksRepository
        .createQueryBuilder('book')
        .select('LOWER(TRIM(book.title))', 'normalizedTitle')
        .addSelect('array_agg(book.id)', 'ids')
        .where("LOWER(TRIM(book.title)) NOT ILIKE :newBook", { newBook: 'новая книга' })
        .andWhere('book.status != :archived', { archived: 'archived' })
        .groupBy('LOWER(TRIM(book.title))')
        .having('COUNT(*) >= 2')
        .getRawMany<{ normalizedTitle: string; ids: unknown }>(),
      // Author grouping for probability
      this.booksRepository
        .createQueryBuilder('book')
        .select('LOWER(TRIM(book.author))', 'normalizedAuthor')
        .addSelect('array_agg(book.id)', 'ids')
        .where('book.author IS NOT NULL')
        .andWhere("LOWER(TRIM(book.author)) != ''")
        .andWhere('book.status != :archived', { archived: 'archived' })
        .groupBy('LOWER(TRIM(book.author))')
        .having('COUNT(*) >= 2')
        .getRawMany<{ normalizedAuthor: string; ids: unknown }>(),
    ]);

    // Build bookId → groupKey maps for DB-level title and author matching
    const titleGroupMap = new Map<string, string>();
    for (const g of allTitlesRaw) {
      for (const id of parseIds(g.ids)) titleGroupMap.set(id, g.normalizedTitle);
    }
    const authorGroupMap = new Map<string, string>();
    for (const g of allAuthorsRaw) {
      for (const id of parseIds(g.ids)) authorGroupMap.set(id, g.normalizedAuthor);
    }

    this.logger.debug(
      `[duplicates] isbn_groups=${isbnGroupsRaw.length} title_groups=${titleGroupsRaw.length}` +
      ` allTitles=${allTitlesRaw.length} allAuthors=${allAuthorsRaw.length}` +
      ` titleMap=${titleGroupMap.size} authorMap=${authorGroupMap.size}`,
    );

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

    const total = allGroups.length;
    const totalPages = Math.ceil(total / limit);
    const pageGroups = allGroups.slice((page - 1) * limit, page * limit);

    // Step 3: Bulk-fetch books only for this page
    const pageIds = [...new Set(pageGroups.flatMap((g) => g.ids))];
    const bookMap = new Map<string, Book>();
    if (pageIds.length > 0) {
      const books = await this.booksRepository.find({
        where: { id: In(pageIds) },
        relations: ['photos', 'box', 'ocrResult', 'ozonProduct'],
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

    const calcGroupProbability = (groupIds: string[], books: Book[], groupType: 'isbn' | 'title') => {
      let bestProb = 0;
      let bestFields: string[] = [];
      for (let i = 0; i < groupIds.length; i++) {
        for (let j = i + 1; j < groupIds.length; j++) {
          const idA = groupIds[i];
          const idB = groupIds[j];
          const a = books[i];
          const b = books[j];
          const isbnMatch = groupType === 'isbn';
          // DB-level: PostgreSQL grouped these by LOWER(TRIM(title/author)) — more reliable
          const titleMatchDb = !!(titleGroupMap.get(idA) && titleGroupMap.get(idA) === titleGroupMap.get(idB));
          const authorMatchDb = !!(authorGroupMap.get(idA) && authorGroupMap.get(idA) === authorGroupMap.get(idB));
          // JS-level: homoglyph normalization catches what DB misses
          const na = norm(a?.title); const nb = norm(b?.title);
          const aa = norm(a?.author); const ab = norm(b?.author);
          const titleMatch = titleMatchDb || !!(na && nb && na === nb);
          const authorMatch = authorMatchDb || !!(aa && ab && aa === ab);
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

    let debugCount = 0;
    for (const group of pageGroups) {
      const books = group.ids.map((id) => bookMap.get(id)).filter(Boolean) as Book[];
      if (books.length < 2) continue;
      const { probability, matchedFields } = calcGroupProbability(group.ids, books, group.type);

      // Log first 3 groups in detail to diagnose probability issues
      if (debugCount < 3) {
        debugCount++;
        const idA = group.ids[0];
        const idB = group.ids[1];
        const a = books[0];
        const b = books[1];
        this.logger.debug(
          `[dup #${debugCount}] key="${group.key}" type=${group.type} prob=${probability} fields=${matchedFields.join(',')}` +
          ` | A(${idA}): title="${a?.title}" author="${a?.author}"` +
          ` | B(${idB}): title="${b?.title}" author="${b?.author}"` +
          ` | titleMapA="${titleGroupMap.get(idA)}" titleMapB="${titleGroupMap.get(idB)}"` +
          ` | authorMapA="${authorGroupMap.get(idA)}" authorMapB="${authorGroupMap.get(idB)}"`,
        );
      }

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
          SELECT isbn FROM books
          WHERE isbn IS NOT NULL AND isbn != '' AND status != 'archived'
          GROUP BY isbn HAVING COUNT(*) >= 2
        ) sub
      `),
      this.booksRepository.manager.query<[{ cnt: string }]>(`
        SELECT COUNT(*) AS cnt FROM (
          SELECT LOWER(TRIM(title)) FROM books
          WHERE LOWER(TRIM(title)) NOT ILIKE 'новая книга'
            AND status != 'archived'
            AND (isbn IS NULL OR isbn = '')
          GROUP BY LOWER(TRIM(title)) HAVING COUNT(*) >= 2
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
