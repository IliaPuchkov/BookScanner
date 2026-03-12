import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { Book } from '../../books/entities/book.entity';

@Entity('ocr_results')
export class OcrResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Book, (book) => book.ocrResult, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'book_id' })
  book: Book;

  @Column({ name: 'book_id', unique: true })
  bookId: string;

  @Column({ type: 'text', nullable: true })
  rawOcrText: string;

  @Column({ type: 'jsonb', nullable: true })
  extractedData: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  photo01Extraction: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  photo02Extraction: Record<string, unknown>;

  @Column({ default: 'pending' })
  status: string;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
