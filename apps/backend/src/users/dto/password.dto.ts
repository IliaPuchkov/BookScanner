import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StrongPassword } from '../../common/decorators/strong-password.decorator';

/** Admin sets a temporary password for another user; omitted → the server generates one. */
export class SetPasswordDto {
  @ApiPropertyOptional({ example: 'NewPass123', minLength: 8 })
  @IsOptional()
  @StrongPassword()
  password?: string;
}

/** A user changes their own password. */
export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword: string;

  @ApiProperty({ example: 'NewPass123', minLength: 8 })
  @StrongPassword()
  newPassword: string;
}
