import {
  authorsCompatible,
  authorTokens,
  buildCopySets,
  buildDuplicateGroups,
  groupMatch,
  groupState,
  pairKey,
  titleCore,
  volumeLabel,
} from './duplicate-matching';

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

const row = (id: string, title: string, author: string, isbn: string | null = null) => ({ id, title, author, isbn });
const idsOf = (groups: { ids: string[] }[]) => groups.map((g) => g.ids);

// «Бухара» in two books by Садриддин Айни, entered by operators in every possible way
const bukhara = [
  row('1', 'Бухара', 'Айни Садриддин'),
  row('2', 'Бухара (Воспоминания): В двух книгах. Книга 1', 'Садриддин Айни'),
  row('3', 'Бухара Воспоминания Книга 2', 'Айни Садриддин'),
  row('4', 'Бухара', 'Садриддин Айни'),
  row('5', 'Бухара (Воспоминания): В двух книгах. Книга 2', 'Айни С.'),
  row('6', 'Бухара (Воспоминания) в двух книгах. Книга 1', 'Садриддин Айни'),
];

describe('buildDuplicateGroups — exact', () => {
  it('puts author spelling variants of one title in one group', () => {
    const groups = buildDuplicateGroups([
      row('1', 'Ледяной дом', 'Лажечников Иван Иванович', '978-5-0000-0000-0'),
      row('2', 'Ледяной дом', 'И. И. Лажечников'),
      row('3', 'Ледяной дом', 'И.И. Лажечников', '5-09-003220-3'),
    ], 'exact');
    expect(groups).toEqual([{ criterion: 'exact', id: '1', key: 'ледяной дом', ids: ['1', '2', '3'] }]);
  });

  it('keeps different authors of a generic title apart', () => {
    const groups = buildDuplicateGroups([
      row('1', 'Избранное', 'Житков Б.'),
      row('2', 'Избранное', 'Житков Борис Степанович'),
      row('3', 'Избранное', 'Борис Слуцкий'),
    ], 'exact');
    expect(idsOf(groups)).toEqual([['1', '2']]);
  });

  it('does not let a vague name chain two different authors (complete linkage)', () => {
    const groups = buildDuplicateGroups([
      row('1', 'Повести и рассказы', 'Толстой Лев Николаевич'),
      row('2', 'Повести и рассказы', 'Лев Толстой'),
      row('3', 'Повести и рассказы', 'Толстой Лев Львович'),
    ], 'exact');
    expect(groups).toHaveLength(1);
    expect(groups[0].ids).toHaveLength(2);
  });

  it('gives the same groups whatever order the rows come in', () => {
    // "Вольф А." fits both, but they don't fit each other — only one can join it
    const rows = [
      row('1', 'Дремучие Бескиды', 'Вольф Абрам Яковлевич'),
      row('2', 'Дремучие Бескиды', 'Вольф А.'),
      row('3', 'Дремучие Бескиды', 'Вольф Александр Яковлевич'),
    ];
    const expected = buildDuplicateGroups(rows, 'exact');
    expect(expected).toHaveLength(1);
    expect(buildDuplicateGroups([rows[2], rows[1], rows[0]], 'exact')).toEqual(expected);
    expect(buildDuplicateGroups([rows[1], rows[2], rows[0]], 'exact')).toEqual(expected);
  });

  it('links books with one ISBN, and different ISBNs only when ISBN is ignored', () => {
    const same = [
      row('1', 'Ледяной дом', 'И. И. Лажечников', '5-09-003220-3'),
      row('2', 'Ледяной дом', 'Лажечников Иван Иванович', '5090032203'),
    ];
    expect(idsOf(buildDuplicateGroups(same, 'exact'))).toEqual([['1', '2']]);
    const other = [same[0], row('2', 'Ледяной дом', 'Лажечников Иван Иванович', '5-256-00092-6')];
    expect(buildDuplicateGroups(other, 'exact')).toEqual([]);
    expect(idsOf(buildDuplicateGroups(other, 'exact', false))).toEqual([['1', '2']]);
  });

  it('does not chain two ISBNs through a book without one when ISBN counts', () => {
    const rows = [
      row('1', 'Повести', 'Гоголь Н. В.', '5-09-003220-3'),
      row('2', 'Повести', 'Николай Гоголь'),
      row('3', 'Повести', 'Гоголь Николай', '5-256-00092-6'),
    ];
    expect(idsOf(buildDuplicateGroups(rows, 'exact'))).toEqual([['1', '2']]);
    expect(idsOf(buildDuplicateGroups(rows, 'exact', false))).toEqual([['1', '2', '3']]);
  });

  it('splits «Бухара» by exact title', () => {
    expect(idsOf(buildDuplicateGroups(bukhara, 'exact'))).toEqual([['1', '4']]);
  });
});

describe('buildDuplicateGroups — books without an author', () => {
  const rows = [
    row('1', 'Большая Советская Энциклопедия. Том 19', 'Не указан'),
    row('2', 'Большая Советская Энциклопедия. Том 30', ''),
    row('3', 'Большая Советская Энциклопедия', 'Коллектив авторов'),
    row('4', 'Большая Советская Энциклопедия', 'Прохоров А. М.'),
  ];

  it('groups them with each other, never with a known author', () => {
    expect(idsOf(buildDuplicateGroups(rows, 'fuzzy', true, true))).toEqual([['1', '2', '3']]);
  });

  it('leaves them out by default', () => {
    expect(buildDuplicateGroups(rows, 'fuzzy')).toEqual([]);
    expect(buildDuplicateGroups([...rows, row('5', 'Большая Советская Энциклопедия', 'А. Прохоров')], 'exact', true, false))
      .toEqual([expect.objectContaining({ ids: ['4', '5'] })]);
  });
});

describe('buildDuplicateGroups — isbn', () => {
  it('groups by valid ISBN only, whatever the title and author', () => {
    const groups = buildDuplicateGroups([
      row('1', 'Самое главное', 'Михаил Зощенко', '5-7633-0150-1'),
      row('2', 'Старик Хоттабыч', 'Лагин Л. И.', '5763301501'),
      row('3', 'Повести', 'Гоголь', '978-5-0000-0000-0'),
      row('4', 'Рассказы', 'Чехов', '978-5-0000-0000-0'),
    ], 'isbn');
    expect(groups).toEqual([{ criterion: 'isbn', id: '1', key: '5763301501', ids: ['1', '2'] }]);
  });
});

describe('buildDuplicateGroups — fuzzy', () => {
  it('puts every «Бухара» volume and spelling in one group', () => {
    const groups = buildDuplicateGroups(bukhara, 'fuzzy');
    expect(groups).toEqual([{ criterion: 'fuzzy', id: '1', key: 'бухара', ids: ['1', '2', '3', '4', '5', '6'] }]);
  });

  it('tolerates a one-letter typo in a long word', () => {
    const groups = buildDuplicateGroups([...bukhara, row('7', 'Бухара Воспомипания Книга 2', 'Айни Садриддин')], 'fuzzy');
    expect(groups[0].ids).toContain('7');
    expect(idsOf(buildDuplicateGroups([
      row('1', 'Восноминания о Бухаре', 'Айни Садриддин'),
      row('2', 'Воспоминания', 'Садриддин Айни'),
    ], 'fuzzy'))).toEqual([['1', '2']]);
  });

  it('does not tolerate typos in short words', () => {
    expect(buildDuplicateGroups([
      row('1', 'Мать', 'Горький Максим'),
      row('2', 'Мачь', 'Максим Горький'),
    ], 'fuzzy')).toEqual([]);
  });

  it('links only when one title starts the other', () => {
    expect(buildDuplicateGroups([
      row('1', 'Рассказы', 'Чехов А. П.'),
      row('2', 'Повести и рассказы', 'Антон Чехов'),
      row('3', 'Повести', 'Чехов Антон Павлович'),
    ], 'fuzzy').map((g) => g.ids)).toEqual([['2', '3']]);
  });

  it('keeps different authors apart', () => {
    expect(buildDuplicateGroups([
      row('1', 'Бухара', 'Айни Садриддин'),
      row('2', 'Бухара. Путеводитель', 'Иванов П. П.'),
    ], 'fuzzy')).toEqual([]);
  });

  it('respects ISBN on request', () => {
    const rows = [
      row('1', 'Бухара. Книга 1', 'Айни Садриддин', '5-09-003220-3'),
      row('2', 'Бухара. Книга 2', 'Садриддин Айни', '5-256-00092-6'),
    ];
    expect(buildDuplicateGroups(rows, 'fuzzy')).toEqual([]);
    expect(idsOf(buildDuplicateGroups(rows, 'fuzzy', false))).toEqual([['1', '2']]);
  });
});

describe('titleCore / volumeLabel', () => {
  it.each([
    ['Бухара (Воспоминания): В двух книгах. Книга 1', ['бухара', 'воспоминания'], 'Кн. 1'],
    ['Бухара Воспоминания Книга 2', ['бухара', 'воспоминания'], 'Кн. 2'],
    ['Бухара', ['бухара'], null],
    ['Война и мир. Т. 1', ['война', 'мир'], 'Т. 1'],
    ['Собрание сочинений в 10 томах. Том третий', ['собрание', 'сочинений'], 'Т. 3'],
    ['Тихий Дон. Книга вторая', ['тихий', 'дон'], 'Кн. 2'],
    ['Тихий Дон. Часть II', ['тихий', 'дон'], 'Ч. 2'],
    ['Книга джунглей', ['книга', 'джунглей'], null],
    ['1984', ['1984'], null],
  ])('%s', (title, core, volume) => {
    expect(titleCore(title)).toEqual(core);
    expect(volumeLabel(title)).toBe(volume);
  });
});

describe('groupState', () => {
  const r = (id: string, copyGroupId: string | null = null) => ({ id, title: 'Бухара', author: 'Айни С.', isbn: null, copyGroupId });
  const state = (rows: ReturnType<typeof r>[], resolved: Array<[string, string]> = []) =>
    groupState(rows.map((x) => x.id), new Map(rows.map((x) => [x.id, x])), new Set(resolved.map(([a, b]) => pairKey(a, b))));

  it('keeps a pair resolved "not copies" in the group and counts the rest as undecided', () => {
    const s = state([r('1'), r('2'), r('3')], [['1', '2']]);
    expect(s.resolvedPairs).toEqual([['1', '2']]);
    expect(s.unresolvedCount).toBe(2);
    expect(s.looseIds).toEqual(['1', '2', '3']);
  });

  it('is fully decided once the books are split into two copy sets — the old resolution agrees', () => {
    // «Бухара» 1 and 4 were resolved "not copies"; the admin now puts them into Кн. 1 and Кн. 2
    const s = state([r('1', 'k1'), r('2', 'k1'), r('6', 'k1'), r('3', 'k2'), r('4', 'k2'), r('5', 'k2')], [['1', '4']]);
    expect(s.unresolvedCount).toBe(0);
    expect(s.sets).toEqual([{ copyGroupId: 'k1', ids: ['1', '2', '6'] }, { copyGroupId: 'k2', ids: ['3', '4', '5'] }]);
    expect(s.conflictPairs).toEqual([]);
  });

  it('folds a book resolved against all others and brings it back for a new arrival', () => {
    const s = state([r('1', 'k'), r('2', 'k'), r('3')], [['1', '3'], ['2', '3']]);
    expect(s.excludedIds).toEqual(['3']);
    expect(s.unresolvedCount).toBe(0);
    const later = state([r('1', 'k'), r('2', 'k'), r('3'), r('4')], [['1', '3'], ['2', '3']]);
    expect(later.looseIds).toEqual(['3', '4']);
    expect(later.unresolvedCount).toBe(3);
  });

  it('reports a resolution inside one copy set as a conflict, the set wins', () => {
    const s = state([r('1', 'k'), r('2', 'k')], [['1', '2']]);
    expect(s.conflictPairs).toEqual([['1', '2']]);
    expect(s.unresolvedCount).toBe(0);
  });
});

describe('groupMatch', () => {
  it('flags the odd ISBN and a differing author', () => {
    const m = groupMatch([
      row('1', 'Повести', 'Гоголь Н. В.', '5-09-003220-3'),
      row('2', 'Повести', 'Николай Гоголь', '5-09-003220-3'),
      row('3', 'Повести', 'Не указан', '5-256-00092-6'),
    ], 'exact');
    expect(m.matchedFields).toEqual(['Название', 'Автор']);
    expect(m.differingFields).toEqual(['ISBN']);
    expect(m.isbnDiffers).toEqual(['3']);
  });

  it('shows a misread ISBN in an ISBN group', () => {
    const m = groupMatch([
      row('1', 'Самое главное', 'Михаил Зощенко', '5-7633-0150-1'),
      row('2', 'Старик Хоттабыч', 'Лагин Л. И.', '5-7633-0150-1'),
    ], 'isbn');
    expect(m.matchedFields).toEqual(['ISBN']);
    expect(m.differingFields).toEqual(['Название', 'Автор']);
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
