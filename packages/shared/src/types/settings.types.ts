export interface ISystemSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  valueType: SettingValueType;
  updatedAt: Date;
}

export enum SettingValueType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  JSON = 'json',
}
