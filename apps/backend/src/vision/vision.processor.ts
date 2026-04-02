import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { VISION_QUEUE, VISION_JOBS } from './vision.constants';
import { VisionService } from './vision.service';

export interface ExtractBookJobData {
  bookId: string;
}

@Processor(VISION_QUEUE, { concurrency: 5 })
export class VisionProcessor extends WorkerHost {
  private readonly logger = new Logger(VisionProcessor.name);

  constructor(private readonly visionService: VisionService) {
    super();
  }

  async process(job: Job<ExtractBookJobData>): Promise<void> {
    if (job.name !== VISION_JOBS.EXTRACT_BOOK) return;

    const { bookId } = job.data;
    this.logger.log(`Processing extraction job for book ${bookId}`);

    try {
      await this.visionService.extractBookData(bookId);
      this.logger.log(`Extraction completed for book ${bookId}`);
    } catch (error) {
      this.logger.error(
        `Extraction failed for book ${bookId}: ${error instanceof Error ? error.message : error}`,
      );
      // Пробрасываем ошибку, чтобы BullMQ пометил job как failed
      throw error;
    }
  }
}
