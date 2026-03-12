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

@Entity('ozon_products')
export class OzonProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => Book, (book) => book.ozonProduct, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'book_id' })
  book: Book;

  @Column({ name: 'book_id', unique: true })
  bookId: string;

  @Column({ nullable: true })
  ozonProductId: string;

  @Column({ type: 'jsonb', nullable: true })
  publishPayload: Record<string, unknown>;

  @Column({ default: 'draft' })
  status: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  averageMarketPrice: number;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
