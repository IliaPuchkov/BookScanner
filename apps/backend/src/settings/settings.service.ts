import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from './entities/system-setting.entity';
import { UpsertSettingDto } from './dto/upsert-setting.dto';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(SystemSetting)
    private readonly settingsRepository: Repository<SystemSetting>,
  ) {}

  async getAll(): Promise<SystemSetting[]> {
    return this.settingsRepository.find({ order: { key: 'ASC' } });
  }

  async getByKey(key: string): Promise<SystemSetting | null> {
    return this.settingsRepository.findOne({ where: { key } });
  }

  async getValue<T = string>(key: string, defaultValue: T): Promise<T> {
    const setting = await this.getByKey(key);
    if (!setting) return defaultValue;

    switch (setting.valueType) {
      case 'number':
        return Number(setting.value) as T;
      case 'boolean':
        return (setting.value === 'true') as T;
      case 'json':
        return JSON.parse(setting.value) as T;
      default:
        return setting.value as T;
    }
  }

  async upsert(dto: UpsertSettingDto): Promise<SystemSetting> {
    let setting = await this.getByKey(dto.key);

    if (setting) {
      setting.value = dto.value;
      if (dto.description !== undefined) setting.description = dto.description;
      if (dto.valueType !== undefined) setting.valueType = dto.valueType;
    } else {
      setting = this.settingsRepository.create(dto);
    }

    return this.settingsRepository.save(setting);
  }
}
