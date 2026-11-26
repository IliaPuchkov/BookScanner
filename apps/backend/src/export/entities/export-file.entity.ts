import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

/** A saved Excel export (Settings → «Выгрузка в Excel»): kept EXPORT_TTL_DAYS, seen only by its author */
@Entity('export_files')
export class ExportFile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // SET NULL, not CASCADE: the row must outlive a deleted admin so the cleanup cron still removes the file
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  /** storage key (S3 or local), never sent to the client */
  @Column({ type: 'varchar' })
  fileKey: string;

  @Column({ type: 'varchar' })
  fileName: string;

  @Column({ type: 'int' })
  sizeBytes: number;

  @Column({ type: 'int' })
  bookCount: number;

  /** from, to, dateField, fields, sheets — to show what's inside */
  @Column({ type: 'jsonb' })
  params: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp' })
  expiresAt: Date;
}
