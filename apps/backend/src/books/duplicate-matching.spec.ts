import { authorsCompatible, authorTokens, buildCopySets, buildDuplicateGroups } from './duplicate-matching';

const same = (a: string, b: string) => authorsCompatible(authorTokens(a), authorTokens(b));

describe('authorsCompatible', () => {
  it.each([
    ['И. И. Лажечников', 'Лажечников Иван Иванович'],
    ['И.И. Лажечников', 'Лажечников Иван Иванович'],
    ['Лев Толстой', 'Толстой Л. Н.'],
    ['Пушкин Александр Сергеевич', 'Александр Сергеевич Пушкин'],
    ['Арк. Минчковский', 'Минчковский Аркадий Миронович'],
    ['Н.С. Ашукин, М.Г. Ашукина', 'Ашукин Николай Сергеевич'],
    ['С. Г. Бархударов и др.', 'С. Г. Бархударов'],
    ['Мамин-Сибиряк Дмитрий Наркисович', 'Д. Н. Мамин-Сибиряк'],
  ])('%s = %s', (a, b) => expect(same(a, b)).toBe(true));

  it.each([
    ['Иванов А.', 'Иванов Б.'],
    // shared first name only
    ['Борис Слуцкий', 'Житков Борис Степанович'],
    // surname must not match the start of a patronymic
    ['Андрей Платонов', 'Богданов Андрей Платонович'],
    ['Толстой Лев Николаевич', 'Толстой Лев Львович'],
    ['Седых Константин Федорович', 'Седых Кирилл Федорович'],
    ['', 'Пушкин А. С.'],
  ])('%s ≠ %s', (a, b) => expect(same(a, b)).toBe(false));
});

describe('buildDuplicateGroups', () => {
  const row = (id: string, title: string, author: string, isbn: string | null = null) => ({ id, title, author, isbn });

  it('puts author spelling variants of one title in one group', () => {
    const groups = buildDuplicateGroups([
      row('1', 'Ледяной дом', 'Лажечников Иван Иванович', '978-5-0000-0000-0'),
      row('2', 'Ледяной дом', 'И. И. Лажечников'),
      row('3', 'Ледяной дом', 'И.И. Лажечников', '5-09-003220-3'),
    ]);
    expect(groups).toEqual([expect.objectContaining({ type: 'title', ids: ['1', '2', '3'] })]);
  });

  it('keeps different authors of a generic title apart', () => {
    const groups = buildDuplicateGroups([
      row('1', 'Избранное', 'Житков Б.'),
      row('2', 'Избранное', 'Житков Борис Степанович'),
      row('3', 'Избранное', 'Борис Слуцкий'),
    ]);
    expect(groups.map((g) => g.ids)).toEqual([['1', '2']]);
  });

  it('does not let a vague name chain two different authors (complete linkage)', () => {
    const groups = buildDuplicateGroups([
      row('1', 'Повести и рассказы', 'Толстой Лев Николаевич'),
      row('2', 'Повести и рассказы', 'Лев Толстой'),
      row('3', 'Повести и рассказы', 'Толстой Лев Львович'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids).toHaveLength(2);
  });

  it('never links two books with valid ISBNs by title', () => {
    const groups = buildDuplicateGroups([
      row('1', 'Ледяной дом', 'И. И. Лажечников', '5-09-003220-3'),
      row('2', 'Ледяной дом', 'Лажечников Иван Иванович', '5-256-00092-6'),
    ]);
    expect(groups).toEqual([]);
  });

  it('gives each title component its own authorKey', () => {
    const groups = buildDuplicateGroups([
      row('a', 'Рассказы', 'Чехов А. П.'),
      row('b', 'Рассказы', 'Антон Павлович Чехов'),
      row('c', 'Рассказы', 'Бунин И. А.'),
      row('d', 'Рассказы', 'Иван Бунин'),
    ]);
    expect(new Set(groups.map((g) => g.authorKey)).size).toBe(2);
  });
});

describe('buildCopySets', () => {
  const copy = (id: string, title: string, author: string | null, isbn: string | null, copyGroupId: string | null = null) =>
    ({ id, title, author, isbn, copyGroupId });
  const sorted = (sets: string[][]) => sets.map((s) => [...s].sort()).sort((a, b) => a[0].localeCompare(b[0]));

  it('joins a no-ISBN copy with its junk-ISBN pair', () => {
    expect(sorted(buildCopySets([
      copy('1', 'Восэ', 'Сатым Улуг-Зода', null),
      copy('2', 'Восэ', 'Сатым Улуг-Зода', '2313'),
    ]))).toEqual([['1', '2']]);
  });

  it('keeps today\'s raw-ISBN groupings even when authors were OCR\'d differently', () => {
    expect(sorted(buildCopySets([
      copy('1', 'Микроэлектронная аппаратура на бескорпусных интегральных микросхемах', 'Воженин И. Н., Коледов Л. А.', '283'),
      copy('2', 'Микроэлектронная аппаратура на бескорпусных интегральных микросхемах', 'Воженин И.Н., Коледов А.А.', '283'),
    ]))).toEqual([['1', '2']]);
  });

  it('does not link through the placeholder ISBN', () => {
    expect(sorted(buildCopySets([
      copy('1', 'Собрание сочинений в 5 томах. Том 1', 'Пушкин А. С.', '978-5-0000-0000-0'),
      copy('2', 'Собрание сочинений в 4 томах. Том 2', 'Толстой Л. Н.', '978-5-0000-0000-0'),
    ]))).toEqual([['1'], ['2']]);
  });

  it('keeps existing sets and separates editions with different valid ISBNs', () => {
    expect(sorted(buildCopySets([
      copy('1', 'Книга', 'Автор А.', '5-09-003220-3', 'set-x'),
      copy('2', 'Другое название', 'Кто-то', null, 'set-x'),
      copy('3', 'Книга', 'Автор А.', '5-256-00092-6'),
    ]))).toEqual([['1', '2'], ['3']]);
  });
});
