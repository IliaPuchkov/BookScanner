import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@bookscanner/shared';

@ApiTags('Admin - Settings')
@Controller('admin/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@ApiBearerAuth()
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Получить все настройки' })
  getAll() {
    return this.settingsService.getAll();
  }

  @Post()
  @ApiOperation({ summary: 'Создать/обновить настройку' })
  upsert(@Body() dto: UpsertSettingDto) {
    return this.settingsService.upsert(dto);
  }
}
