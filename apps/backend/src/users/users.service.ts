import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '../common/dto/pagination.dto';
import {
  BCRYPT_ROUNDS,
  UserRole,
  MAX_FAILED_LOGIN_ATTEMPTS,
  LOGIN_LOCK_MS,
} from '@bookscanner/shared';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: [{ email: dto.email }, { phone: dto.phone }],
    });

    if (existing) {
      throw new ConflictException('Пользователь с таким email или телефоном уже существует');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = this.usersRepository.create({
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email,
      passwordHash,
      role: dto.role,
    });

    return this.usersRepository.save(user);
  }

  async findAll(pagination: PaginationDto) {
    const [users, total] = await this.usersRepository.findAndCount({
      skip: pagination.skip,
      take: pagination.limit,
      order: { createdAt: pagination.order },
    });

    return {
      data: users,
      meta: {
        total,
        page: pagination.page,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
      },
    };
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { phone } });
  }

  async findByPhoneOrEmail(identifier: string): Promise<User | null> {
    return this.usersRepository.findOne({
      where: [{ email: identifier }, { phone: identifier }],
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    Object.assign(user, dto);
    return this.usersRepository.save(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findById(id);
    await this.usersRepository.remove(user);
  }

  async countByRole(role: UserRole): Promise<number> {
    return this.usersRepository.count({ where: { role } });
  }

  async updateRefreshToken(id: string, hashedToken: string | null): Promise<void> {
    await this.usersRepository.update(id, {
      refreshToken: hashedToken ?? (undefined as any),
    });
  }

  async giveConsent(id: string): Promise<void> {
    await this.usersRepository.update(id, { consentGivenAt: new Date() });
  }

  /**
   * Record a failed login for the user. Once the consecutive-failure count
   * reaches MAX_FAILED_LOGIN_ATTEMPTS the account is locked for LOGIN_LOCK_MS;
   * every further failure re-arms the lock window.
   */
  async recordFailedLogin(user: User): Promise<void> {
    const attempts = (user.failedLoginAttempts ?? 0) + 1;
    const patch: Partial<User> = { failedLoginAttempts: attempts };
    if (attempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
      patch.lockedUntil = new Date(Date.now() + LOGIN_LOCK_MS);
    }
    await this.usersRepository.update(user.id, patch);
  }

  /** Clear the failed-login counter and any lock (called on successful login). */
  async resetFailedLogin(user: User): Promise<void> {
    if (!user.failedLoginAttempts && !user.lockedUntil) return;
    await this.usersRepository.update(user.id, {
      failedLoginAttempts: 0,
      lockedUntil: null,
    });
  }

  async anonymizeUser(id: string): Promise<void> {
    await this.findById(id);
    await this.usersRepository.update(id, {
      fullName: 'Удалённый пользователь',
      phone: `deleted_${id}`,
      email: `deleted_${id}@deleted.local`,
      passwordHash: '',
      refreshToken: null as any,
      isApproved: false,
      consentGivenAt: null,
    });
  }
}
