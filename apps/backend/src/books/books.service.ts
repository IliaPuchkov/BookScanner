import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import { Book } from './entities/book.entity';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BoxesService } from '../boxes/boxes.service';
import { UserRole } from '@bookscanner/shared';
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
    });

    return this.booksRepository.save(book);
  }

  async findAll(userId: string, role: UserRole, pagination: PaginationDto, boxId?: string, search?: string) {
    const qb = this.booksRepository
      .createQueryBuilder('book')
      .leftJoinAndSelect('book.box', 'box')
      .leftJoinAndSelect('book.photos', 'photos');

    if (role !== UserRole.ADMIN) {
      qb.andWhere('book.created_by = :userId', { userId });
    }

    if (boxId) {
      qb.andWhere('book.box_id = :boxId', { boxId });
    }

    if (search) {
      qb.andWhere(
        '(book.title ILIKE :search OR book.author ILIKE :search OR book.isbn ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('book.createdAt', pagination.order)
      .skip(pagination.skip)
      .take(pagination.limit);

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

  async remove(id: string, userId: string, role: UserRole): Promise<void> {
    const book = await this.findOne(id);
    this.checkOwnership(book, userId, role);
    await this.booksRepository.remove(book);
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
