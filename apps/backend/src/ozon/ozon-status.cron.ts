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
}
