import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Book } from '../../books/entities/book.entity';
import { User } from '../../users/entities/user.entity';

// One row per pair, stored with book1Id < book2Id (unique index + check, migration 1747900000000)
@Entity('duplicate_resolutions')
@Index('uq_dup_res_pair', ['book1Id', 'book2Id'], { unique: true })
export class DuplicateResolution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Book, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'book1_id' })
  book1: Book;

  @Column({ name: 'book1_id' })
  book1Id: string;

  @ManyToOne(() => Book, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'book2_id' })
  book2: Book;

  @Column({ name: 'book2_id' })
  book2Id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resolved_by_id' })
  resolvedBy: User;

  @Column({ name: 'resolved_by_id' })
  resolvedById: string;

  @CreateDateColumn({ name: 'resolved_at' })
  resolvedAt: Date;
}
