import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { StatsModule } from '../stats/stats.module';
import { CardDefaultsService } from './card-defaults.service';
import { CardController } from './card.controller';

/** Card post-processing shared by every marketplace: defaults for fields the AI did not give. */
@Module({
  imports: [SettingsModule, StatsModule],
  controllers: [CardController],
  providers: [CardDefaultsService],
  exports: [CardDefaultsService],
})
export class CardModule {}
