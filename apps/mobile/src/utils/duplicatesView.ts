import type { DuplicateCriterion } from '../types';
import { getStoredJson, setStoredJson } from './storage';

/** How the Duplicates screen looks for copies — remembered on the device, shared with the Dashboard */
export type DuplicatesView = {
  criterion: DuplicateCriterion;
  respectIsbn: boolean;
  includeUnknownAuthor: boolean;
  showResolved: boolean;
};

const VIEW_KEY = 'duplicates.view';

export const DEFAULT_DUPLICATES_VIEW: DuplicatesView = {
  criterion: 'exact',
  respectIsbn: true,
  includeUnknownAuthor: false,
  showResolved: false,
};

export const DUPLICATE_CRITERIA: Array<{ value: DuplicateCriterion; label: string }> = [
  { value: 'isbn', label: 'ISBN' },
  { value: 'exact', label: 'Автор + название' },
  { value: 'fuzzy', label: 'Похожие названия' },
];

/** The stored view, or the default when nothing is stored or storage is unavailable. */
export async function loadDuplicatesView(): Promise<DuplicatesView> {
  try {
    const stored = await getStoredJson<Partial<DuplicatesView>>(VIEW_KEY);
    return { ...DEFAULT_DUPLICATES_VIEW, ...(stored ?? {}) };
  } catch {
    return DEFAULT_DUPLICATES_VIEW;
  }
}

export function saveDuplicatesView(view: DuplicatesView): void {
  setStoredJson(VIEW_KEY, view).catch(() => {});
}

/** Server params of a view: the title-only switches are not sent for the ISBN criterion. */
export function duplicatesViewParams(view: DuplicatesView) {
  return {
    criterion: view.criterion,
    respectIsbn: view.criterion === 'isbn' ? undefined : view.respectIsbn,
    includeUnknownAuthor: view.criterion === 'isbn' ? undefined : view.includeUnknownAuthor,
  };
}
