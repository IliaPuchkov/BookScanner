import { applyDecorators } from '@nestjs/common';
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

/** Password rule shared by registration, admin-created users and password changes. */
export function StrongPassword() {
  return applyDecorators(
    IsString(),
    MinLength(8, { message: 'Пароль должен содержать минимум 8 символов' }),
    MaxLength(128),
    Matches(/(?=.*[a-zа-яё])(?=.*[A-ZА-ЯЁ])(?=.*\d)/, {
      message: 'Пароль должен содержать строчные и заглавные буквы, а также цифры',
    }),
  );
}
