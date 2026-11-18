import { Controller, Get, Post, Put, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from './settings.service';
import { HashtagRulesService } from './hashtag-rules.service';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SaveHashtagRulesDto, PreviewHashtagRulesDto } from './dto/hashtag-rules.dto';
import { DEFAULT_HASHTAG_RULES, applyHashtagRules } from './hashtag-rules';
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
  constructor(
    private readonly settingsService: SettingsService,
    private readonly hashtagRulesService: HashtagRulesService,
  ) {}

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

  @Get('hashtag-rules')
  @ApiOperation({ summary: 'Правила отбора хэштегов (и стандартный набор)' })
  async getHashtagRules() {
    return { rules: await this.hashtagRulesService.getRules(), defaults: DEFAULT_HASHTAG_RULES };
  }

  @Put('hashtag-rules')
  @ApiOperation({ summary: 'Сохранить весь список правил отбора хэштегов' })
  async saveHashtagRules(@Body() dto: SaveHashtagRulesDto) {
    return { rules: await this.hashtagRulesService.saveRules(dto.rules) };
  }

  @Post('hashtag-rules/preview')
  @ApiOperation({ summary: 'Проверить, что правила сделают с хэштегами' })
  async previewHashtagRules(@Body() dto: PreviewHashtagRulesDto) {
    const ctx = { yearPublished: dto.yearPublished };
    const result = dto.rules
      ? applyHashtagRules(dto.tags, dto.rules, ctx)
      : await this.hashtagRulesService.apply(dto.tags, ctx);
    return { result };
  }
}
