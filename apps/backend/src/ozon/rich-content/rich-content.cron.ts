import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RichContentService } from './rich-content.service';

@Injectable()
export class RichContentCron {
  private readonly logger = new Logger(RichContentCron.name);

  constructor(private readonly richContent: RichContentService) {}

  // Fills in rich content of books published before the feature was on (within daily update limits)
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handlePush() {
    try {
      if (!(await this.richContent.isEnabled())) return;
      await this.richContent.pushPending();
    } catch (err) {
      this.logger.error('Rich content push failed', err);
    }
  }
}
