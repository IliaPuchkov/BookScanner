import { BooksService } from './books.service';
import { DEFAULT_CARD_DEFAULTS, fillDefaults } from '../card/card-defaults';

/** applyExtraction with an in-memory book: what lands on the card and what gets marked. */
function setup(book: Record<string, any>) {
  const saved: Record<string, any>[] = [];
  const repo = {
    findOne: async () => book,
    save: async (b: Record<string, any>) => {
      saved.push({ ...b, dimensions: b.dimensions && { ...b.dimensions } });
      return b;
    },
  };
  const service = new BooksService(repo as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  return { service, saved };
}

function extract(raw: Record<string, any>) {
  const { values, defaulted } = fillDefaults(raw, DEFAULT_CARD_DEFAULTS);
  return { data: { ...raw, ...values }, defaulted };
}

describe('BooksService.applyExtraction', () => {
  it('marks every field filled from the defaults on a fresh card', async () => {
    const { service, saved } = setup({ id: 'b1', defaultedFields: [], dimensions: null });
    const { data, defaulted } = extract({ title: 'Бухара', weightGross: 380, dimensions: { width: 130, height: 0, depth: 0 } });
    await service.applyExtraction('b1', data as any, defaulted);
    const b = saved[0];
    expect(b.title).toBe('Бухара');
    expect(b.weightGross).toBe(380);
    expect(b.dimensions).toEqual({ width: 130, height: 100, depth: 35 });
    expect(b.defaultedFields.sort()).toEqual(
      ['bookType', 'condition', 'coverType', 'depth', 'direction', 'height', 'language', 'paperType'].sort(),
    );
  });

  it('never replaces a real value with a default', async () => {
    const { service, saved } = setup({
      id: 'b1',
      weightGross: 520,
      condition: 'Отличная',
      dimensions: { width: 120, height: 200, depth: 18 },
      defaultedFields: [],
    });
    const { data, defaulted } = extract({ title: 'Т' });
    await service.applyExtraction('b1', data as any, defaulted);
    const b = saved[0];
    expect(b.weightGross).toBe(520);
    expect(b.condition).toBe('Отличная');
    expect(b.dimensions).toEqual({ width: 120, height: 200, depth: 18 });
    expect(b.defaultedFields).not.toContain('weightGross');
    expect(b.defaultedFields).not.toContain('width');
  });

  it('replaces a placeholder with the AI value and drops its mark', async () => {
    const { service, saved } = setup({
      id: 'b1',
      weightGross: 450,
      dimensions: { width: 100, height: 100, depth: 35 },
      defaultedFields: ['weightGross', 'width', 'height', 'depth', 'language'],
    });
    const { data, defaulted } = extract({ weightGross: 610, dimensions: { width: 145, height: 0, depth: 0 }, language: 'Немецкий' });
    await service.applyExtraction('b1', data as any, defaulted);
    const b = saved[0];
    expect(b.weightGross).toBe(610);
    expect(b.language).toBe('Немецкий');
    expect(b.dimensions).toEqual({ width: 145, height: 100, depth: 35 });
    expect(b.defaultedFields).toEqual(expect.arrayContaining(['height', 'depth']));
    expect(b.defaultedFields).not.toContain('weightGross');
    expect(b.defaultedFields).not.toContain('width');
    expect(b.defaultedFields).not.toContain('language');
  });
});
