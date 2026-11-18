import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { VIDEO_COVER_JOBS, VIDEO_COVER_QUEUE } from './video-cover.constants';
import { VideoCoverService } from './video-cover.service';

// One render at a time: the host has a single vCPU and 512 MB for the backend container.
@Processor(VIDEO_COVER_QUEUE, { concurrency: 1 })
export class VideoCoverProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoCoverProcessor.name);

  constructor(private readonly videoCovers: VideoCoverService) {
    super();
  }

  async process(job: Job<{ bookId: string; force?: boolean }>): Promise<string> {
    if (job.name !== VIDEO_COVER_JOBS.RENDER) return 'ignored';
    const { bookId, force } = job.data;
    try {
      return await this.videoCovers.renderForBook(bookId, force);
    } catch (error) {
      this.logger.error(`Video cover for book ${bookId} failed: ${error instanceof Error ? error.message : error}`);
      throw error;
    }
  }
}
