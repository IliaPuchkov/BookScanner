import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsService } from '../../settings/settings.service';
import {
  OZON_PAYLOAD_CONFIG_KEY,
  SYSTEM_ATTR_KEYS,
  configOrStandard,
  ozonPayloadConfigError,
  type OzonPayloadConfig,
} from './ozon-payload-config';

@Injectable()
export class OzonPayloadConfigService {
  constructor(private readonly settingsService: SettingsService) {}

  /** Saved config, or the standard one (a broken setting must not stop publication). */
  async get(): Promise<OzonPayloadConfig> {
    try {
      return configOrStandard(await this.settingsService.getValue<unknown>(OZON_PAYLOAD_CONFIG_KEY, null));
    } catch {
      return configOrStandard(null);
    }
  }

  /** Trims the texts, keeps the system flags as the code defines them; throws a 400 with the reason. */
  normalize(input: OzonPayloadConfig): OzonPayloadConfig {
    const c: OzonPayloadConfig = JSON.parse(JSON.stringify(input ?? {}));
    if (Array.isArray(c.attributes)) {
      c.attributes = c.attributes.map((a) => {
        const out = { ...a, label: a.label?.trim(), system: SYSTEM_ATTR_KEYS.includes(a.key) || undefined };
        if (!out.system) delete out.system;
        if (out.source?.kind === 'const' || out.source?.kind === 'dictionary') {
          out.source = { ...out.source, value: out.source.value?.trim() };
        }
        if (out.valueMap) out.valueMap = out.valueMap.filter((m) => m.from?.trim());
        if (Array.isArray(out.conditions)) {
          out.conditions = out.conditions.map((c) => ({
            ...c,
            checks: (c.checks ?? []).map((ch) => ({ ...ch, value: ch.value?.trim() })),
            action:
              c.action?.kind === 'const' || c.action?.kind === 'dictionary'
                ? { ...c.action, value: c.action.value?.trim() }
                : c.action,
          }));
          if (out.conditions.length === 0) delete out.conditions;
        }
        return out;
      });
    }
    if (Array.isArray(c.categories)) c.categories = c.categories.map((x) => ({ ...x, label: x.label?.trim() }));
    const error = ozonPayloadConfigError(c);
    if (error) throw new BadRequestException(error);
    return c;
  }

  async save(input: OzonPayloadConfig): Promise<OzonPayloadConfig> {
    const clean = this.normalize(input);
    await this.settingsService.upsert({
      key: OZON_PAYLOAD_CONFIG_KEY,
      value: JSON.stringify(clean),
      valueType: 'json',
      description: 'Сборка карточки Ozon: категории, атрибуты, замены значений',
    });
    return clean;
  }
}
