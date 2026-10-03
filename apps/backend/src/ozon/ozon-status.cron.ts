import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OzonService } from './ozon.service';

@Injectable()
export class OzonStatusCron {
  private readonly logger = new Logger(OzonStatusCron.name);

  constructor(private readonly ozonService: OzonService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleStatusCheck() {
    this.logger.debug('Running Ozon status check cron');
    await this.ozonService.checkAllPendingStatuses();
  }

  // Books marked failed may still go live on Ozon later (moderation lag, transient errors)
  @Cron(CronExpression.EVERY_HOUR)
  async handleFailedReconcile() {
    this.logger.debug('Running failed-publication reconcile cron');
    await this.ozonService.reconcileFailedPublications();
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleArchivedSync() {
    this.logger.debug('Running Ozon archived status sync cron');
    await this.ozonService.syncArchivedStatus();
  }
}
