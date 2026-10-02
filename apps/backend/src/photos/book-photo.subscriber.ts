import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntitySubscriberInterface } from 'typeorm';
import { BookPhoto } from './entities/book-photo.entity';
import { ThumbnailService } from './thumbnail.service';

/**
 * Queues a thumbnail for every cover loaded without one. Hooking the load
 * (instead of each list query) covers all list screens, including new ones.
 */
@Injectable()
export class BookPhotoSubscriber implements EntitySubscriberInterface<BookPhoto> {
  constructor(
    @InjectDataSource() dataSource: DataSource,
    private readonly thumbnails: ThumbnailService,
  ) {
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return BookPhoto;
  }

  afterLoad(photo: BookPhoto): void {
    if (photo.id) this.thumbnails.enqueue(photo);
  }
}
