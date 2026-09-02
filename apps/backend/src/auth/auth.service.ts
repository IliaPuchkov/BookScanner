import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/entities/user.entity';
import { BCRYPT_ROUNDS } from '@bookscanner/shared';

/**
 * A valid bcrypt hash of a random string, generated once at startup. Used to
 * run a real bcrypt.compare when the supplied login has no matching account,
 * so a missing user cannot be distinguished from a wrong password by timing.
 */
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'no-such-user-placeholder',
  BCRYPT_ROUNDS,
);

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.create({
      fullName: dto.fullName,
      phone: dto.phone,
      email: dto.email,
      password: dto.password,
    });

    await this.usersService.giveConsent(user.id);

    return {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      role: user.role,
      isApproved: user.isApproved,
    };
  }

  async validateUser(phoneOrEmail: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByPhoneOrEmail(phoneOrEmail);

    // Always run one bcrypt comparison so a non-existent account does not
    // respond faster than a real account with a wrong password (enumeration).
    const isPasswordValid = await bcrypt.compare(
      password,
      user?.passwordHash || DUMMY_PASSWORD_HASH,
    );

    if (!user || !user.passwordHash) return null;

    if (!isPasswordValid) {
      await this.usersService.recordFailedLogin(user);
      return null;
    }

    // Password is correct beyond this point. If the account is locked because
    // of earlier failed attempts, reveal it (the caller proved they know the
    // password) but do not let them in until the window passes.
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60_000,
      );
      throw new ForbiddenException(
        `Аккаунт временно заблокирован из-за неудачных попыток входа. Повторите через ${minutes} мин.`,
      );
    }

    await this.usersService.resetFailedLogin(user);
    return user;
  }

  async login(user: User) {
    const tokens = await this.generateTokens(user);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        phone: user.phone,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
        consentGivenAt: user.consentGivenAt,
      },
    };
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);

    if (!user.refreshToken) {
      throw new ForbiddenException('Доступ запрещен');
    }

    const isTokenValid = await bcrypt.compare(refreshToken, user.refreshToken);
    if (!isTokenValid) {
      throw new ForbiddenException('Недействительный refresh token');
    }

    const tokens = await this.generateTokens(user);
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshToken(userId, null);
  }

  private async generateTokens(user: User) {
    const payload = { sub: user.id, role: user.role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRATION', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async updateRefreshToken(userId: string, refreshToken: string) {
    const hashedToken = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await this.usersService.updateRefreshToken(userId, hashedToken);
  }
}
