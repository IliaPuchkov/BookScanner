import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ExtraPhotosService } from './extra-photos.service';

@Injectable()
export class ExtraPhotosCron {
  private readonly logger = new Logger(ExtraPhotosCron.name);

  constructor(private readonly extraPhotos: ExtraPhotosService) {}

  // Draws and sends extra photos of published books (within daily update limits)
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handlePush() {
    try {
      if (!(await this.extraPhotos.isEnabled())) return;
      await this.extraPhotos.pushPending();
    } catch (err) {
      this.logger.error('Extra photos push failed', err);
    }
  }
}
