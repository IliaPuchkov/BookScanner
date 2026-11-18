import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsService } from './settings.service';
import { HashtagRulesService } from './hashtag-rules.service';
import { SettingsController } from './settings.controller';
import { SystemSetting } from './entities/system-setting.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting])],
  controllers: [SettingsController],
  providers: [SettingsService, HashtagRulesService],
  exports: [SettingsService, HashtagRulesService],
})
export class SettingsModule {}
