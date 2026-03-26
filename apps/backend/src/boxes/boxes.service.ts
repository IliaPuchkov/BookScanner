import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Box } from './entities/box.entity';
import { Book } from '../books/entities/book.entity';
import { CreateBoxDto } from './dto/create-box.dto';
import { UpdateBoxDto } from './dto/update-box.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UserRole } from '@bookscanner/shared';

@Injectable()
export class BoxesService {
  constructor(
    @InjectRepository(Box)
    private readonly boxesRepository: Repository<Box>,
    @InjectRepository(Book)
    private readonly booksRepository: Repository<Book>,
  ) {}

  async create(dto: CreateBoxDto, userId: string): Promise<Box> {
    const existing = await this.boxesRepository.findOne({
      where: { boxNumber: dto.boxNumber, createdById: userId },
    });
    if (existing) {
      throw new ConflictException('Коробка с таким номером уже существует');
    }

    const box = this.boxesRepository.create({
      ...dto,
      createdById: userId,
    });
    return this.boxesRepository.save(box);
  }

  async findAll(userId: string, role: UserRole, pagination: PaginationDto) {
    const qb = this.boxesRepository.createQueryBuilder('box');

    if (role !== UserRole.ADMIN) {
      qb.where('box.created_by = :userId', { userId });
    }

    qb.orderBy('box.createdAt', pagination.order)
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

  async findOne(id: string): Promise<Box> {
    const box = await this.boxesRepository.findOne({
      where: { id },
      relations: ['createdBy'],
    });
    if (!box) {
      throw new NotFoundException('Коробка не найдена');
    }
    return box;
  }

  async update(id: string, dto: UpdateBoxDto, userId: string, role: UserRole): Promise<Box> {
    const box = await this.findOne(id);
    this.checkOwnership(box, userId, role);
    Object.assign(box, dto);
    return this.boxesRepository.save(box);
  }

  async remove(id: string, userId: string, role: UserRole): Promise<void> {
    const box = await this.findOne(id);
    this.checkOwnership(box, userId, role);
    await this.boxesRepository.remove(box);
  }

  async deleteIfEmpty(boxId: string): Promise<void> {
    const count = await this.booksRepository.countBy({ boxId });
    if (count === 0) {
      await this.boxesRepository.delete(boxId);
    }
  }

  async deleteEmptyBoxesForUser(userId: string): Promise<void> {
    await this.boxesRepository
      .createQueryBuilder()
      .delete()
      .from(Box)
      .where('created_by = :userId', { userId })
      .andWhere(
        'id NOT IN (SELECT DISTINCT box_id FROM books WHERE box_id IS NOT NULL)',
      )
      .execute();
  }

  private checkOwnership(box: Box, userId: string, role: UserRole) {
    if (role !== UserRole.ADMIN && box.createdById !== userId) {
      throw new ForbiddenException('Нет доступа к этой коробке');
    }
  }
}
