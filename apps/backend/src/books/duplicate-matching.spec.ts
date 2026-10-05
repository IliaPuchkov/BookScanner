import {
  authorsCompatible,
  authorTokens,
  buildCopySets,
  buildDuplicateCards,
  buildDuplicateGroups,
  pairKey,
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

describe('buildDuplicateCards', () => {
  const book = (id: string, title: string, author: string, isbn: string | null = null, isCopy = false) =>
    ({ id, title, author, isbn, isCopy });
  const cards = (books: ReturnType<typeof book>[], resolved: Array<[string, string]> = []) =>
    buildDuplicateCards(
      buildDuplicateGroups(books),
      new Map(books.map((b) => [b.id, b])),
      new Set(resolved.map(([a, b]) => pairKey(a, b))),
    );
  const sorted = (cs: { ids: string[] }[]) => cs.map((c) => [...c.ids].sort());

  it('drops fully resolved groups and fully confirmed copy sets', () => {
    expect(cards([book('a', 'Повести', 'Гоголь Н. В.'), book('b', 'Повести', 'Николай Гоголь')], [['a', 'b']])).toEqual([]);
    expect(cards([book('a', 'Повести', 'Гоголь Н. В.', null, true), book('b', 'Повести', 'Николай Гоголь', null, true)])).toEqual([]);
  });

  it('keeps a new book next to its confirmed copy set', () => {
    const result = cards([
      book('a', 'Повести', 'Гоголь Н. В.', null, true),
      book('b', 'Повести', 'Николай Гоголь', null, true),
      book('c', 'Повести', 'Гоголь Николай Васильевич'),
    ]);
    expect(result).toEqual([expect.objectContaining({ ids: ['a', 'b', 'c'], probability: 60 })]);
  });

  it('splits a group into cards of unresolved pairs with distinct componentKeys', () => {
    const result = cards(
      [book('a', 'Повести', 'Гоголь Н. В.'), book('b', 'Повести', 'Гоголь Н.'), book('c', 'Повести', 'Николай Гоголь'), book('d', 'Повести', 'Н. Гоголь')],
      [['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd']],
    );
    expect(result.map((c) => c.ids)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(new Set(result.map((c) => c.componentKey)).size).toBe(2);
  });

  it('shows a book on one card when it is in both an ISBN and a title group', () => {
    const result = cards([
      book('a', 'Повести', 'Гоголь Н. В.', '5-08-002638-3'),
      book('b', 'Повести', 'Николай Гоголь', '5-08-002638-3'),
      book('c', 'Повести', 'Гоголь Николай Васильевич', '978-5-0000-0000-0'),
      book('d', 'Повести', 'Н. В. Гоголь'),
    ]);
    expect(result).toEqual([expect.objectContaining({ type: 'isbn', key: '5080026383', componentKey: 'a', probability: 100 })]);
    expect(sorted(result)).toEqual([['a', 'b', 'c', 'd']]);
  });

  it('joins title variants through a shared ISBN', () => {
    const result = cards([
      book('a', 'Одиссея капитана Блада. Хроника', 'Сабатини Рафаэль', '5858440096'),
      book('b', 'Одиссея капитана Блада. Хроника', 'Рафаэль Сабатини'),
      book('c', 'Одиссея капитана Блада; Хроника', 'Рафаэль Сабатини', '5-85844-009-6'),
      book('d', 'Одиссея капитана Блада; Хроника', 'Сабатини Р.'),
    ]);
    expect(sorted(result)).toEqual([['a', 'b', 'c', 'd']]);
  });

  it('does not merge through an ISBN shared by different authors (OCR error)', () => {
    const result = cards([
      book('a', 'Самое главное', 'Михаил Зощенко', '5-7633-0150-1'),
      book('b', 'Самое главное', 'Зощенко Михаил'),
      book('c', 'Старик Хоттабыч', 'Лагин Л. И.', '5-7633-0150-1'),
      book('d', 'Старик Хоттабыч', 'Л. Лагин'),
    ]);
    expect(sorted(result)).toEqual(expect.arrayContaining([['a', 'b'], ['c', 'd']]));
    expect(sorted(result)).not.toContainEqual(['a', 'b', 'c', 'd']);
  });

  it('does not bring back copy sets the admin already separated', () => {
    // Title group split by the admin into set {a,b} and set {c,d}; {a,c} also share an ISBN
    // with a confirmed copy e — merging must not glue the two sets back together.
    const result = cards(
      [
        book('a', 'Повести', 'Гоголь Н. В.', '5-08-002638-3', true),
        book('b', 'Повести', 'Николай Гоголь', null, true),
        book('c', 'Повести', 'Н. В. Гоголь', null, true),
        book('d', 'Повести', 'Гоголь Николай', null, true),
        book('e', 'Повести', 'Гоголь Н.', '5-08-002638-3', true),
      ],
      [['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd'], ['e', 'c'], ['e', 'd']],
    );
    expect(result).toEqual([]);
  });

  it('treats a "Не указан" author as unknown when merging', () => {
    const result = cards([
      book('a', 'Краткий политический словарь', 'Абаренков Валерий Павлович', '5-250-00047-9'),
      book('b', 'Краткий политический словарь', 'Не указан', '5-250-00047-9'),
      book('c', 'Краткий политический словарь', 'Не указан'),
    ]);
    expect(sorted(result)).toEqual([['a', 'b', 'c']]);
  });

  it('leaves cards that share no book unchanged', () => {
    const result = cards([
      book('a', 'Рассказы', 'Чехов А. П.', '5-09-003220-3'),
      book('b', 'Рассказы', 'Антон Чехов', '5-09-003220-3'),
      book('c', 'Повести', 'Гоголь Н. В.'),
      book('d', 'Повести', 'Николай Гоголь'),
    ]);
    expect(result.map(({ type, key, authorKey, componentKey, ids }) => ({ type, key, authorKey, componentKey, ids }))).toEqual([
      { type: 'isbn', key: '5090032203', authorKey: undefined, componentKey: undefined, ids: ['a', 'b'] },
      { type: 'title', key: 'повести', authorKey: 'c', componentKey: undefined, ids: ['c', 'd'] },
    ]);
  });
});
