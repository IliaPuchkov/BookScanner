import { ContentScopeService } from './content-scope.service';

describe('ContentScopeService', () => {
  const all = { storeIds: null, activeStoreId: 'A' };
  const onlyB = { storeIds: ['B'], activeStoreId: 'A' };
  const onlyA = { storeIds: ['A'], activeStoreId: 'A' };

  it('allows every store when unrestricted', () => {
    expect(ContentScopeService.allows(all, 'X')).toBe(true);
    expect(ContentScopeService.allows(all, null)).toBe(true);
  });

  it('allows only the listed stores', () => {
    expect(ContentScopeService.allows(onlyB, 'B')).toBe(true);
    expect(ContentScopeService.allows(onlyB, 'C')).toBe(false);
  });

  it('treats a book without a store as published in the active store', () => {
    expect(ContentScopeService.allows(onlyB, null)).toBe(false);
    expect(ContentScopeService.allows(onlyA, null)).toBe(true);
    expect(ContentScopeService.allows({ storeIds: ['B'], activeStoreId: null }, null)).toBe(false);
  });

  it('adds no SQL when unrestricted, else a store filter with its parameters', () => {
    const p1: unknown[] = ['published'];
    expect(ContentScopeService.sql(all, p1)).toBe('');
    expect(p1).toEqual(['published']);

    const p2: unknown[] = ['published', 100];
    expect(ContentScopeService.sql(onlyB, p2)).toBe('AND COALESCE(op."storeId", $4) = ANY($3)');
    expect(p2).toEqual(['published', 100, ['B'], 'A']);
  });
});
