import { Module } from '@nestjs/common';
import { MaintenanceController } from './maintenance.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [MaintenanceController],
})
export class MaintenanceModule {}
