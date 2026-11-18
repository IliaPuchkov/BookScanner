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

  // Same as Settings → «Синхронизировать с Ozon»: archived ⇄ published, both ways
  @Cron('0 3 * * *', { timeZone: 'Europe/Moscow' })
  async handleNightlySync() {
    this.logger.log('Running nightly Ozon status sync');
    try {
      await this.ozonService.syncOzonStatus();
    } catch (err) {
      this.logger.error('Nightly Ozon status sync failed', err);
    }
  }
}
