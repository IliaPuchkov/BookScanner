import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Box } from './entities/box.entity';
import { CreateBoxDto } from './dto/create-box.dto';
import { UpdateBoxDto } from './dto/update-box.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import { UserRole } from '@bookscanner/shared';

@Injectable()
export class BoxesService {
  constructor(
    @InjectRepository(Box)
    private readonly boxesRepository: Repository<Box>,
  ) {}

  async create(dto: CreateBoxDto, userId: string): Promise<Box> {
    const existing = await this.boxesRepository.findOne({
      where: { boxNumber: dto.boxNumber },
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

  private checkOwnership(box: Box, userId: string, role: UserRole) {
    if (role !== UserRole.ADMIN && box.createdById !== userId) {
      throw new ForbiddenException('Нет доступа к этой коробке');
    }
  }
}
