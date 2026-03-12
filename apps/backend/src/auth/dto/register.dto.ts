import { IsString, IsEmail, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'Иванов Иван Иванович' })
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty({ example: '+79001234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'ivan@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePassword123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;
}
