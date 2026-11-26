import { CoverType, PaperType } from '@bookscanner/shared';
import {
  DEFAULT_CARD_DEFAULTS,
  cardDefaultsError,
  changedDefaultableFields,
  fillDefaults,
  withStandard,
} from './card-defaults';

const d = DEFAULT_CARD_DEFAULTS;

describe('fillDefaults', () => {
  it('fills every empty field and names it', () => {
    const { values, defaulted } = fillDefaults({}, d);
    expect(values).toEqual({
      weightGross: 450,
      dimensions: { width: 100, height: 100, depth: 35 },
      paperType: PaperType.OFFSET,
      coverType: CoverType.HARDCOVER,
      language: d.language,
      condition: d.condition,
      bookType: d.bookType,
      direction: d.direction,
    });
    expect(defaulted.sort()).toEqual(
      ['bookType', 'condition', 'coverType', 'depth', 'direction', 'height', 'language', 'paperType', 'weightGross', 'width'].sort(),
    );
  });

  it('keeps given values and fills only the gaps', () => {
    const { values, defaulted } = fillDefaults(
      {
        weightGross: 320,
        dimensions: { width: 130, height: 0, depth: 22 },
        coverType: CoverType.SOFTCOVER,
        language: 'Английский',
        condition: '  ',
      },
      d,
    );
    expect(values.weightGross).toBe(320);
    expect(values.dimensions).toEqual({ width: 130, height: 100, depth: 22 });
    expect(values.coverType).toBe(CoverType.SOFTCOVER);
    expect(values.language).toBe('Английский');
    expect(values.condition).toBe(d.condition);
    expect(defaulted).toEqual(expect.arrayContaining(['height', 'condition', 'paperType']));
    expect(defaulted).not.toEqual(expect.arrayContaining(['weightGross']));
    expect(defaulted).not.toContain('width');
  });

  it('uses the saved defaults', () => {
    const custom = { ...d, weightG: 400, lengthMm: 210 };
    const { values } = fillDefaults({}, custom);
    expect(values.weightGross).toBe(400);
    expect(values.dimensions.height).toBe(210);
  });

  it('treats decimal strings from Postgres as numbers', () => {
    const { values, defaulted } = fillDefaults({ weightGross: '512.00' as unknown as number }, d);
    expect(values.weightGross).toBe(512);
    expect(defaulted).not.toContain('weightGross');
  });
});

describe('changedDefaultableFields', () => {
  const before = {
    weightGross: '450.00' as unknown as number,
    dimensions: { width: 100, height: 100, depth: 35 },
    paperType: PaperType.OFFSET,
    language: 'Русский',
  };

  it('ignores fields sent unchanged (old apps send the whole form)', () => {
    expect(
      changedDefaultableFields(before, {
        weightGross: 450,
        dimensions: { width: 100, height: 100, depth: 35 },
        paperType: PaperType.OFFSET,
        language: 'Русский',
      }),
    ).toEqual([]);
  });

  it('names changed fields and axes', () => {
    expect(
      changedDefaultableFields(before, {
        weightGross: 500,
        dimensions: { width: 100, height: 210, depth: 35 },
        language: 'Немецкий',
      }),
    ).toEqual(['weightGross', 'height', 'language']);
  });

  it('skips fields not in the edit', () => {
    expect(changedDefaultableFields(before, { condition: undefined })).toEqual([]);
  });
});

describe('cardDefaultsError', () => {
  it('accepts the standard defaults', () => {
    expect(cardDefaultsError(d)).toBeNull();
  });

  it('rejects bad numbers and empty texts', () => {
    expect(cardDefaultsError({ ...d, weightG: 0 })).toMatch(/Вес/);
    expect(cardDefaultsError({ ...d, thicknessMm: NaN })).toMatch(/Толщина/);
    expect(cardDefaultsError({ ...d, direction: ' ' })).toMatch(/Направление/);
    expect(cardDefaultsError({ ...d, paperType: 'картон' as PaperType })).toMatch(/бумаги/);
  });
});

describe('withStandard', () => {
  it('fills fields missing from an older saved value', () => {
    expect(withStandard({ weightG: 400 })).toEqual({ ...d, weightG: 400 });
    expect(withStandard(null)).toEqual(d);
  });
});
