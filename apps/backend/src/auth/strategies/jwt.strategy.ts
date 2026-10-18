import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { ITokenPayload } from '@bookscanner/shared';

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
    });
  }

  async validate(payload: ITokenPayload) {
    // A refresh token must not work as a bearer token: it lives 7 days and
    // logout does not revoke it here.
    if (payload.typ !== 'access') {
      throw new UnauthorizedException();
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user.isApproved) {
      throw new UnauthorizedException('Аккаунт ожидает подтверждения администратором');
    }

    return user;
  }
}
