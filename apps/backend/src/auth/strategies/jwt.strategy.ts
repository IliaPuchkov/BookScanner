import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { ITokenPayload } from '@bookscanner/shared';

const ALLOWED_WITH_TEMPORARY_PASSWORD = /\/(users\/me(\/password|\/consent)?|auth\/logout)\/?$/;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: ITokenPayload) {
    // A refresh token must not work as a bearer token: it lives 7 days and
    // logout does not revoke it here.
    if (payload.typ !== 'access') {
      throw new UnauthorizedException();
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user.isApproved) {
      throw new UnauthorizedException('Аккаунт ожидает подтверждения администратором');
    }

    // With a temporary password (set by an admin) only the profile, consent,
    // password change and logout are open. 403, not 401: the token is fine and
    // the mobile app must not try to refresh it.
    if (user.mustChangePassword && !ALLOWED_WITH_TEMPORARY_PASSWORD.test(req.path)) {
      // `error` is what the mobile app checks to open its password screen.
      throw new ForbiddenException('Необходимо сменить временный пароль', 'PasswordChangeRequired');
    }

    return user;
  }
}
