import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { ActivityLog } from './entities/activity-log.entity';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(ActivityLog)
    private readonly activityLogRepository: Repository<ActivityLog>,
  ) {}

  async logActivity(
    userId: string,
    action: string,
    entityType?: string,
    entityId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<ActivityLog> {
    const log = this.activityLogRepository.create({
      userId,
      action,
      entityType,
      entityId,
      metadata,
    });
    return this.activityLogRepository.save(log);
  }

  async getUserStats(userId: string, since?: Date) {
    const qb = this.activityLogRepository
      .createQueryBuilder('log')
      .select('log.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .where('log.user_id = :userId', { userId })
      .groupBy('log.action');

    if (since) {
      qb.andWhere('log.createdAt >= :since', { since });
    }

    return qb.getRawMany();
  }

  async getGlobalStats(since?: Date) {
    const qb = this.activityLogRepository
      .createQueryBuilder('log')
      .select('log.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .groupBy('log.action');

    if (since) {
      qb.andWhere('log.createdAt >= :since', { since });
    }

    return qb.getRawMany();
  }

  async getDailyTrends(days: number = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.activityLogRepository
      .createQueryBuilder('log')
      .select("DATE(log.createdAt)", 'date')
      .addSelect('log.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt >= :since', { since })
      .groupBy('date')
      .addGroupBy('log.action')
      .orderBy('date', 'ASC')
      .getRawMany();
  }

  async getPerUserBookCounts() {
    return this.activityLogRepository
      .createQueryBuilder('log')
      .innerJoin('log.user', 'user')
      .select('user.id', 'userId')
      .addSelect('user.fullName', 'fullName')
      .addSelect('COUNT(*)', 'booksCount')
      .where("log.action = 'card_created'")
      .groupBy('user.id')
      .addGroupBy('user.fullName')
      .orderBy('"booksCount"', 'DESC')
      .getRawMany();
  }
}
