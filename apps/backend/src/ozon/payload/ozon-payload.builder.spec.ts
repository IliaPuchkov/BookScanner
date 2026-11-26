import { CoverType, PaperType } from '@bookscanner/shared';
import { buildOzonImportPayload, type ResolvedOzonData } from '../ozon-payload.builder';
import { DEFAULT_OZON_PAYLOAD_CONFIG } from './ozon-payload-config';
import { DEFAULT_CARD_DEFAULTS } from '../../card/card-defaults';

/**
 * Golden test: the snapshots were recorded from the builder as it was before
 * `ozon_payload_config` (hard-coded attributes). With the standard config the
 * configurable builder must produce exactly the same payloads.
 */
const photos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ fileUrl: `https://s3/b/${i}.jpg`, sortOrder: n - i }));

const base = {
  sku: '12_ABCDEF',
  title: 'Бухара',
  author: 'Иванов Иван',
  isbn: '978-5-17-090735-5',
  publisher: 'Издательство АСТ',
  yearPublished: 1987,
  dimensions: { width: 130, height: 200, depth: 22 },
  weightGross: 410,
  paperType: PaperType.OFFSET,
  coverType: CoverType.HARDCOVER,
  pageCount: 320,
  language: 'Русский',
  condition: 'Хорошая',
  bookType: 'Печатная книга',
  direction: 'Проза',
  price: 1290,
  annotation: 'ВНИМАНИЕ! Книга не новая! Состояние - на фото.\n\nРоман о городе. См. https://example.com/x',
  hashtags: ['#роман', '#ссср'],
  photos: photos(3),
};

const resolvedFull: ResolvedOzonData = {
  brandDictValueId: 501,
  resolvedBrandName: 'АСТ',
  publisherDictValueId: 702,
  resolvedPublisherName: 'АСТ',
  authors: [{ value: 'Иванов И.', dictValueId: 9001 }],
  hashtags: ['#роман', '#ссср'],
};

const cases: Array<[string, Record<string, any>, ResolvedOzonData]> = [
  ['old book, everything resolved', base, resolvedFull],
  ['modern book (2015)', { ...base, yearPublished: 2015 }, resolvedFull],
  ['no year', { ...base, yearPublished: null }, { ...resolvedFull, authors: [] }],
  [
    'softcover, glossy, no dimensions and weight',
    { ...base, coverType: CoverType.SOFTCOVER, paperType: PaperType.GLOSSY, dimensions: { width: 0, height: 0, depth: 0 }, weightGross: null },
    resolvedFull,
  ],
  [
    'several authors, one unknown to Ozon',
    { ...base, author: 'Ильф Илья; Петров Евгений' },
    { ...resolvedFull, authors: [{ value: 'Ильф И.', dictValueId: 11 }, { value: 'Петров Евгений' }] },
  ],
  [
    'no publisher, no isbn, no page count, empty annotation',
    { ...base, publisher: null, isbn: null, pageCount: null, annotation: null },
    { brandDictValueId: 1, resolvedBrandName: 'Нет бренда', authors: [], hashtags: [] },
  ],
  [
    'rich content and extra photos, matte paper',
    { ...base, paperType: PaperType.MATTE, photos: photos(28) },
    { ...resolvedFull, richContent: '{"content":[],"version":0.3}', extraImages: ['https://s3/x/1.jpg', 'https://s3/x/2.jpg', 'https://s3/x/3.jpg', 'https://s3/x/4.jpg'] },
  ],
  [
    'hashtags from the card (no rules passed)',
    { ...base, hashtags: ['политика', 'роман века', '#детектив'] },
    { ...resolvedFull, hashtags: undefined },
  ],
];

describe('buildOzonImportPayload — standard config = legacy payload', () => {
  it.each(cases)('%s', (_name, book, resolved) => {
    const copy = JSON.parse(JSON.stringify(book));
    const payload = (buildOzonImportPayload as any)(copy, resolved, DEFAULT_OZON_PAYLOAD_CONFIG, DEFAULT_CARD_DEFAULTS);
    expect(payload).toMatchSnapshot();
  });
});
