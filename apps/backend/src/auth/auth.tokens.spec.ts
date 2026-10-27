import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@bookscanner/shared';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

const env: Record<string, string> = {
  JWT_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
};
const config = {
  get: (k: string, d?: string) => env[k] ?? d,
  getOrThrow: (k: string) => env[k],
} as unknown as ConfigService;

const user = { id: 'u1', role: UserRole.OPERATOR, isApproved: true } as User;
const usersService = {
  findById: async () => user,
  updateRefreshToken: async () => undefined,
} as unknown as UsersService;

const jwt = new JwtService({ secret: env.JWT_SECRET });
const auth = new AuthService(usersService, jwt, config);
const strategy = new JwtStrategy(config, usersService);
const req = { path: '/api/books' } as any;

async function issue() {
  return (auth as any).generateTokens(user) as Promise<{
    accessToken: string;
    refreshToken: string;
  }>;
}

describe('access / refresh token split', () => {
  it('a refresh token is not accepted as a bearer token', async () => {
    const { accessToken, refreshToken } = await issue();
    await expect(strategy.validate(req, jwt.decode(accessToken))).resolves.toBe(user);
    await expect(strategy.validate(req, jwt.decode(refreshToken))).rejects.toThrow(
      UnauthorizedException,
    );
    // and it cannot even pass the signature check of the access secret
    expect(() => jwt.verify(refreshToken)).toThrow();
  });

  it('an access token is not accepted by /auth/refresh', async () => {
    const { accessToken, refreshToken } = await issue();
    expect(auth.verifyRefreshToken(refreshToken).sub).toBe('u1');
    expect(() => auth.verifyRefreshToken(accessToken)).toThrow(UnauthorizedException);
  });

  it('legacy tokens (no typ): refresh still works, bearer use does not', async () => {
    const legacy = jwt.sign({ sub: 'u1', role: user.role });
    expect(auth.verifyRefreshToken(legacy).sub).toBe('u1');
    await expect(strategy.validate(req, jwt.decode(legacy))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects tokens signed with an unknown key', () => {
    const forged = new JwtService({ secret: 'other' }).sign({ sub: 'u1', typ: 'refresh' });
    expect(() => auth.verifyRefreshToken(forged)).toThrow(UnauthorizedException);
  });
});
