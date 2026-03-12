import { IsString, IsEmail, IsNotEmpty, MinLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@bookscanner/shared';

export class CreateUserDto {
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

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.OPERATOR })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
