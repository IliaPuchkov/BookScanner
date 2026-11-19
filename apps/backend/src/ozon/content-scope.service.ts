import { Injectable } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';

/** Stores where video covers and rich content may be sent; [] = every store. */
export const CONTENT_STORE_IDS_KEY = 'ozon_content_store_ids';
const ACTIVE_STORE_KEY = 'active_ozon_store_id';

export interface ContentScope {
  /** null = no restriction */
  storeIds: string[] | null;
  /** the store used for books whose ozon_products.storeId is empty */
  activeStoreId: string | null;
}

/**
 * Lets the admin try video covers / rich content on one store first (Ozon may fine for
 * content changes). Every sender — publish, both push crons, the backfill work list — asks here.
 */
@Injectable()
export class ContentScopeService {
  constructor(private readonly settingsService: SettingsService) {}

  async get(): Promise<ContentScope> {
    const [ids, active] = await Promise.all([
      this.settingsService.getValue<string[]>(CONTENT_STORE_IDS_KEY, []),
      this.settingsService.getValue<string>(ACTIVE_STORE_KEY, ''),
    ]);
    return { storeIds: Array.isArray(ids) && ids.length ? ids : null, activeStoreId: active || null };
  }

  async set(storeIds: string[]): Promise<ContentScope> {
    await this.settingsService.upsert({
      key: CONTENT_STORE_IDS_KEY,
      value: JSON.stringify([...new Set(storeIds)]),
      valueType: 'json',
      description: 'Магазины Ozon для видеообложек и Rich-контента (пусто — все)',
    });
    return this.get();
  }

  /** Is a book published in `storeId` (empty = the active store) in scope? */
  static allows(scope: ContentScope, storeId: string | null | undefined): boolean {
    if (!scope.storeIds) return true;
    const effective = storeId || scope.activeStoreId;
    return !!effective && scope.storeIds.includes(effective);
  }

  async allows(storeId: string | null | undefined): Promise<boolean> {
    return ContentScopeService.allows(await this.get(), storeId);
  }

  /**
   * SQL condition on `op."storeId"` (ozon_products joined as `op`) for the scope, with its
   * parameters appended to `params`. '' when unrestricted.
   */
  static sql(scope: ContentScope, params: unknown[]): string {
    if (!scope.storeIds) return '';
    params.push(scope.storeIds, scope.activeStoreId ?? '');
    return `AND COALESCE(op."storeId", $${params.length}) = ANY($${params.length - 1})`;
  }
}
