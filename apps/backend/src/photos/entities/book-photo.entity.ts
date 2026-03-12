import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Book } from '../../books/entities/book.entity';

@Entity('book_photos')
export class BookPhoto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Book, (book) => book.photos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'book_id' })
  book: Book;

  @Column({ name: 'book_id' })
  bookId: string;

  @Column()
  fileUrl: string;

  @Column({ nullable: true })
  fileKey: string;

  @Column()
  sortOrder: number;

  @Column({ nullable: true })
  originalFilename: string;

  @Column({ nullable: true })
  mimeType: string;

  @Column({ nullable: true })
  fileSizeBytes: number;

  @CreateDateColumn()
  createdAt: Date;
}
