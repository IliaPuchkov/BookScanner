import { BadRequestException, Injectable } from '@nestjs/common';
import { SettingsService } from './settings.service';
import {
  HASHTAG_RULES_KEY,
  DEFAULT_HASHTAG_RULES,
  MAX_HASHTAG_RULES,
  applyHashtagRules,
  hashtagRuleError,
  type HashtagRule,
  type HashtagContext,
} from './hashtag-rules';

@Injectable()
export class HashtagRulesService {
  constructor(private readonly settingsService: SettingsService) {}

  /** Saved rules, or the old hard-coded forbidden list until the admin saves any */
  async getRules(): Promise<HashtagRule[]> {
    try {
      const rules = await this.settingsService.getValue<HashtagRule[] | null>(HASHTAG_RULES_KEY, null);
      return Array.isArray(rules) ? rules : DEFAULT_HASHTAG_RULES;
    } catch {
      // broken JSON must not stop extraction or publication
      return DEFAULT_HASHTAG_RULES;
    }
  }

  async saveRules(rules: HashtagRule[]): Promise<HashtagRule[]> {
    if (rules.length > MAX_HASHTAG_RULES) {
      throw new BadRequestException(`Не больше ${MAX_HASHTAG_RULES} правил`);
    }
    const ids = new Set<string>();
    const clean = rules.map((r, i) => {
      if (ids.has(r.id)) throw new BadRequestException(`Правило ${i + 1}: повторяющийся id`);
      ids.add(r.id);
      const rule: HashtagRule = {
        id: r.id,
        type: r.type,
        enabled: r.enabled,
        value: r.value.trim(),
        ...(r.type === 'replace' && { replacement: (r.replacement ?? '').trim() }),
        ...(r.type === 'add' && { yearFrom: r.yearFrom ?? null, yearTo: r.yearTo ?? null }),
      };
      const error = hashtagRuleError(rule);
      if (error) throw new BadRequestException(`Правило ${i + 1}: ${error}`);
      return rule;
    });
    await this.settingsService.upsert({
      key: HASHTAG_RULES_KEY,
      value: JSON.stringify(clean),
      valueType: 'json',
      description: 'Правила отбора хэштегов (запрет, замена, обязательные)',
    });
    return clean;
  }

  async apply(tags: string[] | null | undefined, ctx: HashtagContext = {}): Promise<string[]> {
    return applyHashtagRules(tags, await this.getRules(), ctx);
  }
}
