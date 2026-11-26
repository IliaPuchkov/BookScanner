import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsModule } from '../settings/settings.module';
import { StatsModule } from '../stats/stats.module';
import { StorageModule } from '../photos/storage/storage.module';
import { ExportFile } from './entities/export-file.entity';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ExportFilesService } from './export-files.service';

@Module({
  imports: [SettingsModule, StatsModule, StorageModule.register(), TypeOrmModule.forFeature([ExportFile])],
  controllers: [ExportController],
  providers: [ExportService, ExportFilesService],
})
export class ExportModule {}
