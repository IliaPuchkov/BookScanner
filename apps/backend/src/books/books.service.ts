import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import { Book } from './entities/book.entity';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BoxesService } from '../boxes/boxes.service';
import { StatsService } from '../stats/stats.service';
import { PhotosService } from '../photos/photos.service';
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
  constructor(
    @InjectRepository(Book)
    private readonly booksRepository: Repository<Book>,
    private readonly boxesService: BoxesService,
    private readonly statsService: StatsService,
    private readonly photosService: PhotosService,
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
    Object.assign(book, dto);
    return this.booksRepository.save(book);
  }

  async updateFromExtraction(id: string, data: Partial<Book>): Promise<void> {
    const clean = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== null && v !== undefined),
    );
    if (Object.keys(clean).length > 0) {
      await this.booksRepository.update(id, clean as any);
    }
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

  private generateSku(boxNumber: string): string {
    return `${boxNumber}_${nanoid(6).toUpperCase()}`;
  }

  private checkOwnership(book: Book, userId: string, role: UserRole) {
    if (role !== UserRole.ADMIN && book.createdById !== userId) {
      throw new ForbiddenException('Нет доступа к этой книге');
    }
  }
}
