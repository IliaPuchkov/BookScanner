import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { UserRole } from '@bookscanner/shared';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ExtraPhotosService } from './extra-photos.service';

class SetExtraPhotosEnabledDto {
  @IsBoolean()
  enabled: boolean;
}

@ApiTags('Ozon extra photos')
@Controller('ozon/extra-photos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class ExtraPhotosController {
  constructor(private readonly extraPhotos: ExtraPhotosService) {}

  @Get('status')
  @ApiOperation({ summary: 'Доп. фото: включены ли, у скольких карточек Ozon они уже есть' })
  status() {
    return this.extraPhotos.status();
  }

  @Put('enabled')
  @ApiOperation({ summary: 'Включить/выключить доп. фото' })
  setEnabled(@Body() dto: SetExtraPhotosEnabledDto) {
    return this.extraPhotos.setEnabled(dto.enabled);
  }

  @Post('push')
  @ApiOperation({ summary: 'Нарисовать и отправить доп. фото сейчас' })
  push() {
    return this.extraPhotos.pushPending();
  }
}
