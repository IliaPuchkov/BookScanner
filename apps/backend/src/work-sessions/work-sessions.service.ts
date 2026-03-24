import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkSession } from './entities/work-session.entity';
import { BoxesService } from '../boxes/boxes.service';

@Injectable()
export class WorkSessionsService {
  constructor(
    @InjectRepository(WorkSession)
    private readonly sessionRepository: Repository<WorkSession>,
    private readonly boxesService: BoxesService,
  ) {}

  async startSession(userId: string): Promise<WorkSession> {
    const existing = await this.sessionRepository.findOne({
      where: { userId, status: 'active' },
    });
    if (existing) {
      throw new ConflictException('У вас уже есть активная рабочая сессия');
    }

    const session = this.sessionRepository.create({ userId });
    return this.sessionRepository.save(session);
  }

  async getActiveSession(userId: string): Promise<WorkSession | null> {
    return this.sessionRepository.findOne({
      where: { userId, status: 'active' },
      relations: ['books', 'books.photos', 'books.box'],
      order: { startedAt: 'DESC' },
    });
  }

  async endSession(id: string, userId: string): Promise<WorkSession> {
    const session = await this.sessionRepository.findOne({
      where: { id },
    });

    if (!session) {
      throw new NotFoundException('Сессия не найдена');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Нет доступа к этой сессии');
    }
    if (session.status !== 'active') {
      throw new ConflictException('Сессия уже завершена');
    }

    session.status = 'completed';
    session.endedAt = new Date();
    const saved = await this.sessionRepository.save(session);
    await this.boxesService.deleteEmptyBoxesForUser(session.userId);
    return saved;
  }
}
