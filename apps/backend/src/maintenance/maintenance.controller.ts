import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SettingsService } from '../settings/settings.service';

@ApiTags('Maintenance')
@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Статус технических работ (публичный, без авторизации)' })
  async getStatus() {
    const [enabled, startAtSetting, endAtSetting, messageSetting, instructionsSetting, warningMinutes] =
      await Promise.all([
        this.settingsService.getValue<boolean>('maintenance_enabled', false),
        this.settingsService.getByKey('maintenance_start_at'),
        this.settingsService.getByKey('maintenance_end_at'),
        this.settingsService.getByKey('maintenance_message'),
        this.settingsService.getByKey('maintenance_instructions'),
        this.settingsService.getValue<number>('maintenance_warning_minutes', 30),
      ]);

    const now = new Date();
    const startsAt = startAtSetting?.value ? new Date(startAtSetting.value) : null;
    const endsAt = endAtSetting?.value ? new Date(endAtSetting.value) : null;

    // Cast explicitly — DB may store 'true' as string if valueType was not set correctly
    const isActive = enabled === true || (enabled as unknown) === 'true';
    let isWarning = false;

    if (!isActive && startsAt && startsAt > now) {
      const warningMs = warningMinutes * 60 * 1000;
      const warningStart = new Date(startsAt.getTime() - warningMs);
      if (now >= warningStart) {
        isWarning = true;
      }
    }

    return {
      isActive,
      isWarning,
      startsAt: startsAt?.toISOString() ?? null,
      endsAt: endsAt?.toISOString() ?? null,
      message: messageSetting?.value ?? null,
      instructions: instructionsSetting?.value ?? null,
    };
  }
}
