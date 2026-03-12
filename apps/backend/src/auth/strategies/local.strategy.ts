import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      usernameField: 'phoneOrEmail',
      passwordField: 'password',
    });
  }

  async validate(phoneOrEmail: string, password: string) {
    const user = await this.authService.validateUser(phoneOrEmail, password);
    if (!user) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    return user;
  }
}
