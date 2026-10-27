import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@bookscanner/shared';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { AdminService, generateTemporaryPassword } from '../admin/admin.service';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';

function makeUsersService() {
  const update = jest.fn(async () => undefined);
  const service = new UsersService({ update } as any);
  return { service, update };
}

describe('password change', () => {
  it('changes the own password and keeps the session', async () => {
    const { service, update } = makeUsersService();
    const user = { id: 'u1', passwordHash: await bcrypt.hash('OldPass1', 4) } as User;

    await service.changePassword(user, 'OldPass1', 'NewPass1');

    const patch = (update.mock.calls[0] as any[])[1];
    expect(await bcrypt.compare('NewPass1', patch.passwordHash)).toBe(true);
    expect(patch).toMatchObject({
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: false,
    });
    expect(patch).not.toHaveProperty('refreshToken');
  });

  it('a wrong current password counts as a failed login', async () => {
    const { service, update } = makeUsersService();
    const user = {
      id: 'u1',
      passwordHash: await bcrypt.hash('OldPass1', 4),
      failedLoginAttempts: 2,
    } as User;

    await expect(service.changePassword(user, 'Wrong1aa', 'NewPass1')).rejects.toThrow(
      BadRequestException,
    );
    expect(update).toHaveBeenCalledWith('u1', { failedLoginAttempts: 3 });
  });

  it('a locked account cannot keep guessing, even with the right password', async () => {
    const { service, update } = makeUsersService();
    const user = {
      id: 'u1',
      passwordHash: await bcrypt.hash('OldPass1', 4),
      lockedUntil: new Date(Date.now() + 60_000),
    } as User;

    await expect(service.changePassword(user, 'OldPass1', 'NewPass1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('admin sets a password', () => {
  function makeAdmin(target: Partial<User>) {
    const usersService = {
      findById: async () => target,
      setPassword: jest.fn(async () => undefined),
    };
    const statsService = { logActivity: jest.fn(async () => undefined) };
    const admin = new AdminService(usersService as any, {} as any, statsService as any, {} as any);
    return { admin, usersService, statsService };
  }

  it('resets an operator password and revokes their session', async () => {
    const { admin, usersService, statsService } = makeAdmin({ id: 'op', role: UserRole.OPERATOR });
    await admin.setUserPassword('adm', 'op', 'NewPass1');
    expect(usersService.setPassword).toHaveBeenCalledWith('op', 'NewPass1', true);
    expect(statsService.logActivity).toHaveBeenCalledWith('adm', 'password_reset', 'user', 'op');
  });

  it('generates a password when none is given and returns it once', async () => {
    const { admin, usersService } = makeAdmin({ id: 'op', role: UserRole.OPERATOR });
    const { generatedPassword } = await admin.setUserPassword('adm', 'op');
    expect(generatedPassword).toBeDefined();
    expect(usersService.setPassword).toHaveBeenCalledWith('op', generatedPassword, true);
    await expect(admin.setUserPassword('adm', 'op', 'NewPass1')).resolves.toEqual({});
  });

  it('refuses for another admin', async () => {
    const { admin, usersService } = makeAdmin({ id: 'a2', role: UserRole.ADMIN });
    await expect(admin.setUserPassword('adm', 'a2', 'NewPass1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(usersService.setPassword).not.toHaveBeenCalled();
  });
});

describe('temporary password', () => {
  it('marks the user and drops their session', async () => {
    const { service, update } = makeUsersService();
    await service.setPassword('u1', 'TempPass1', true);
    expect((update.mock.calls[0] as any[])[1]).toMatchObject({
      mustChangePassword: true,
      refreshToken: null,
    });
  });

  it('generated passwords meet the password rule', () => {
    for (let i = 0; i < 200; i++) {
      const p = generateTemporaryPassword();
      expect(p).toHaveLength(10);
      expect(p).toMatch(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/);
      expect(p).not.toMatch(/[01OIl]/);
    }
  });

  it('closes the API except profile, consent, password change and logout', async () => {
    const user = { id: 'u1', isApproved: true, mustChangePassword: true } as User;
    const config = { getOrThrow: () => 'secret' } as any;
    const strategy = new JwtStrategy(config, { findById: async () => user } as any);
    const call = (path: string) =>
      strategy.validate({ path } as any, { sub: 'u1', typ: 'access' } as any);

    for (const path of ['/api/users/me', '/api/users/me/password', '/api/users/me/consent', '/api/auth/logout']) {
      await expect(call(path)).resolves.toBe(user);
    }
    for (const path of ['/api/books', '/api/admin/users', '/api/users/me/other']) {
      await expect(call(path)).rejects.toThrow(ForbiddenException);
    }
    user.mustChangePassword = false;
    await expect(call('/api/books')).resolves.toBe(user);
  });
});
