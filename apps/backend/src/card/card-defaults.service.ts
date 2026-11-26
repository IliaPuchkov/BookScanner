import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BookStatus } from '@bookscanner/shared';
import { SettingsService } from '../settings/settings.service';
import { StatsService } from '../stats/stats.service';
import {
  CARD_DEFAULTS_KEY,
  DEFAULTABLE_FIELDS,
  cardDefaultsError,
  defaultValue,
  withStandard,
  type CardDefaults,
  type DefaultableField,
} from './card-defaults';

/** Books whose placeholders may be rewritten: not on Ozon and not being sent there. */
const APPLY_STATUSES: string[] = [BookStatus.PENDING_REVIEW, BookStatus.PUBLICATION_FAILED, BookStatus.IN_LIBRARY];

const AXES = new Set<DefaultableField>(['width', 'height', 'depth']);

/** SQL for the stored value of a field (numbers as numeric, the rest as text). */
function storedValueSql(field: DefaultableField): string {
  if (AXES.has(field)) return `(b.dimensions->>'${field}')::numeric`;
  if (field === 'weightGross') return `b."weightGross"`;
  return `b."${field}"::text`;
}

@Injectable()
export class CardDefaultsService {
  private readonly logger = new Logger(CardDefaultsService.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly statsService: StatsService,
    private readonly dataSource: DataSource,
  ) {}

  /** Saved defaults, or the standard ones (a broken setting must not stop card creation). */
  async get(): Promise<CardDefaults> {
    try {
      return withStandard(
        await this.settingsService.getValue<Partial<CardDefaults> | null>(CARD_DEFAULTS_KEY, null),
      );
    } catch {
      return withStandard(null);
    }
  }

  async save(input: CardDefaults): Promise<CardDefaults> {
    const clean = withStandard(input);
    for (const k of ['language', 'condition', 'bookType', 'direction'] as const) {
      if (typeof clean[k] === 'string') clean[k] = clean[k].trim();
    }
    const error = cardDefaultsError(clean);
    if (error) throw new BadRequestException(error);
    await this.settingsService.upsert({
      key: CARD_DEFAULTS_KEY,
      value: JSON.stringify(clean),
      valueType: 'json',
      description: 'Значения по умолчанию для карточки (если ИИ не определил)',
    });
    return clean;
  }

  /** WHERE part: an unpublished card with a placeholder field that differs from the current default. */
  private staleWhere(d: CardDefaults, params: unknown[]): string {
    const parts = DEFAULTABLE_FIELDS.map((f) => {
      const value = defaultValue(f, d);
      params.push(f, value);
      const cast = typeof value === 'number' ? '::numeric' : '::text';
      return `($${params.length - 1} = ANY(b."defaultedFields") AND ${storedValueSql(f)} IS DISTINCT FROM $${params.length}${cast})`;
    });
    params.push(APPLY_STATUSES);
    return `b.status::text = ANY($${params.length}::text[]) AND (${parts.join(' OR ')})`;
  }

  /** How many cards `apply` would change. */
  async countStale(): Promise<number> {
    const d = await this.get();
    const params: unknown[] = [];
    const [row] = await this.dataSource.query(
      `SELECT count(*)::int AS n FROM books b WHERE ${this.staleWhere(d, params)}`,
      params,
    );
    return row?.n ?? 0;
  }

  /** Rewrites the placeholder fields of unpublished cards with the current defaults. */
  async apply(userId: string): Promise<{ updated: number }> {
    const d = await this.get();
    const updated = await this.dataSource.transaction(async (m) => {
      const params: unknown[] = [];
      const rows: Array<{ id: string }> = await m.query(
        `SELECT b.id FROM books b WHERE ${this.staleWhere(d, params)}`,
        params,
      );
      if (rows.length === 0) return 0;
      const ids = rows.map((r) => r.id);
      for (const f of DEFAULTABLE_FIELDS) {
        const set = AXES.has(f)
          ? `dimensions = jsonb_set(coalesce(dimensions, '{}'::jsonb), '{${f}}', to_jsonb($1::numeric))`
          : f === 'weightGross'
            ? `"weightGross" = $1::numeric`
            : `"${f}" = $1`;
        await m.query(
          `UPDATE books SET ${set}, "updatedAt" = now()
            WHERE id = ANY($2::uuid[]) AND $3 = ANY("defaultedFields")`,
          [defaultValue(f, d), ids, f],
        );
      }
      return ids.length;
    });
    this.logger.log(`card defaults applied to ${updated} book(s)`);
    await this.statsService.logActivity(userId, 'card_defaults_apply', 'setting', undefined, {
      updated,
      defaults: d,
    });
    return { updated };
  }
}
