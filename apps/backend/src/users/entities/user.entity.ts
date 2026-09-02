import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserRole } from '@bookscanner/shared';
import { Exclude } from 'class-transformer';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  fullName: string;

  @Column({ unique: true })
  phone: string;

  @Column({ unique: true })
  email: string;

  @Column()
  @Exclude()
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.OPERATOR })
  role: UserRole;

  @Column({ default: false })
  isApproved: boolean;

  @Column({ nullable: true })
  @Exclude()
  refreshToken: string;

  @Column({ type: 'int', default: 0 })
  @Exclude()
  failedLoginAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  @Exclude()
  lockedUntil: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  consentGivenAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
