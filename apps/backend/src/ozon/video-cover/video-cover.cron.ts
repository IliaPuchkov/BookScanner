import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { VideoCoverService } from './video-cover.service';

@Injectable()
export class VideoCoverCron {
  private readonly logger = new Logger(VideoCoverCron.name);

  constructor(private readonly videoCovers: VideoCoverService) {}

  // Sends finished covers to Ozon in batches (within each store's daily update limit)
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handlePush() {
    try {
      if (!(await this.videoCovers.isEnabled())) return;
      await this.videoCovers.pushPending();
    } catch (err) {
      this.logger.error('Video cover push failed', err);
    }
  }
}
