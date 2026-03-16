import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { PaperType, CoverType, BookStatus } from '@bookscanner/shared';
import { User } from '../../users/entities/user.entity';
import { Box } from '../../boxes/entities/box.entity';
import { BookPhoto } from '../../photos/entities/book-photo.entity';
import { OcrResult } from '../../vision/entities/ocr-result.entity';
import { OzonProduct } from '../../ozon/entities/ozon-product.entity';
import { WorkSession } from '../../work-sessions/entities/work-session.entity';

@Entity('books')
export class Book {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  sku: string;

  @Column()
  title: string;

  @Column({ nullable: true })
  author: string;

  @Column({ nullable: true })
  isbn: string;

  @Column({ nullable: true })
  publisher: string;

  @Column({ nullable: true })
  yearPublished: number;

  @Column({ type: 'jsonb', nullable: true })
  dimensions: { width: number; height: number; depth: number };

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  weightGross: number;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  weightNet: number;

  @Column({ type: 'enum', enum: PaperType, default: PaperType.OFFSET })
  paperType: PaperType;

  @Column({ type: 'enum', enum: CoverType, default: CoverType.HARDCOVER })
  coverType: CoverType;

  @Column({ nullable: true })
  pageCount: number;

  @Column({ default: 'русский' })
  language: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ type: 'text', nullable: true })
  annotation: string;

  @Column('simple-array', { nullable: true })
  hashtags: string[];

  @Column({ default: 'Хорошая' })
  condition: string;

  @Column({ default: 'Печатная книга' })
  bookType: string;

  @Column({ default: 'проза' })
  direction: string;

  @ManyToOne(() => Box, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'box_id' })
  box: Box;

  @Column({ name: 'box_id' })
  boxId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'created_by' })
  createdBy: User;

  @Column({ name: 'created_by' })
  createdById: string;

  @ManyToOne(() => WorkSession, (session) => session.books, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'work_session_id' })
  workSession: WorkSession;

  @Column({ name: 'work_session_id', nullable: true })
  workSessionId: string;

  @OneToMany(() => BookPhoto, (photo) => photo.book, { cascade: true })
  photos: BookPhoto[];

  @OneToOne(() => OcrResult, (ocr) => ocr.book)
  ocrResult: OcrResult;

  @OneToOne(() => OzonProduct, (ozon) => ozon.book)
  ozonProduct: OzonProduct;

  @Column({ nullable: true })
  publishedToOzon: Date;

  @Column({ type: 'enum', enum: BookStatus, default: BookStatus.PENDING_REVIEW })
  status: BookStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
