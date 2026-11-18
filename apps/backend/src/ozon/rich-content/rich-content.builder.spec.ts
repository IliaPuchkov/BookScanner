import { ANNOTATION_PREFIX } from '@bookscanner/shared';
import { buildRichContent, cleanAnnotation, editionLines, RICH_CONTENT_VERSION } from './rich-content.builder';

const book = {
  title: 'Записки о Пушкине. Письма',
  author: 'И.И. Пущин',
  publisher: 'Советская Россия',
  yearPublished: 1979,
  coverType: 'твердый переплет',
  paperType: 'офсетная',
  pageCount: 144,
  printRun: 100000,
  language: 'Русский',
  isbn: null,
  condition: 'Хорошая',
  annotation: `${ANNOTATION_PREFIX}Воспоминания Пущина.\n\nВторой абзац, см. https://example.com`,
} as any;

describe('cleanAnnotation', () => {
  it('drops our «not new» notice and links', () => {
    expect(cleanAnnotation(book.annotation)).toBe('Воспоминания Пущина.\n\nВторой абзац, см.');
  });

  it('drops a hand-edited variant of the notice', () => {
    expect(cleanAnnotation('ВНИМАНИЕ! Книга не новая! Состояние - на фото. Текст')).toBe('Текст');
  });

  it('keeps an annotation without the notice and handles empty ones', () => {
    expect(cleanAnnotation('Просто текст')).toBe('Просто текст');
    expect(cleanAnnotation(ANNOTATION_PREFIX.trim())).toBe('');
    expect(cleanAnnotation(null)).toBe('');
  });
});

describe('editionLines', () => {
  it('lists filled fields with readable labels', () => {
    expect(editionLines(book)).toEqual([
      'Автор: И.И. Пущин',
      'Издательство: Советская Россия',
      'Год издания: 1979',
      'Переплёт: Твердый переплет',
      'Бумага: Офсетная',
      'Страниц: 144',
      'Тираж: 100 000 экз.',
      'Язык: Русский',
    ]);
  });

  it('skips placeholder authors and empty fields', () => {
    expect(editionLines({ ...book, author: 'Не указан', publisher: '', printRun: null, pageCount: 0 })).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^(Автор|Издательство|Тираж|Страниц):/)]),
    );
  });
});

describe('buildRichContent', () => {
  const photos = [
    { url: 'https://s/0.jpg', width: 981, height: 1276 },
    { url: 'https://s/1.jpg' },
    { url: 'https://s/2.jpg' },
    { url: 'https://s/3.jpg' },
  ];
  const json = JSON.parse(buildRichContent(book, photos));
  const rows = json.content[0].blocks;

  it('has the root version Ozon requires', () => {
    expect(json.version).toBe(RICH_CONTENT_VERSION);
    expect(json.content).toHaveLength(1);
  });

  it('puts each section beside a photo in one chess widget, cover first, sides alternating', () => {
    expect(json.content[0]).toMatchObject({ widgetName: 'raShowcase', type: 'chess' });
    expect(rows.map((b: any) => b.title.content[0])).toEqual(['О книге', 'Об издании', 'Состояние']);
    expect(rows.map((b: any) => b.img.src)).toEqual(['https://s/0.jpg', 'https://s/1.jpg', 'https://s/2.jpg']);
    expect(rows.map((b: any) => b.reverse)).toEqual([false, true, false]);
    expect(rows[0].img.alt).toContain('обложка');
  });

  it('splits the annotation into paragraphs', () => {
    expect(rows[0].text.content).toEqual(['Воспоминания Пущина.', 'Второй абзац, см.']);
  });

  it('gives every image sizes, with a 3:4 fallback', () => {
    expect(rows[0].img).toMatchObject({ width: 981, height: 1276, widthMobile: 981, heightMobile: 1276 });
    expect(rows[1].img.width / rows[1].img.height).toBe(3 / 4);
    for (const b of rows) expect(b.imgLink).toBe('');
  });

  it('leaves out «О книге» when there is no annotation text', () => {
    const j = JSON.parse(buildRichContent({ ...book, annotation: ANNOTATION_PREFIX }, photos));
    expect(j.content[0].blocks.map((b: any) => b.title.content[0])).toEqual(['Об издании', 'Состояние']);
  });

  it('puts sections without a photo below the chess as text', () => {
    const j = JSON.parse(buildRichContent(book, photos.slice(0, 2)));
    expect(j.content[0].blocks).toHaveLength(2);
    expect(j.content[1]).toMatchObject({ widgetName: 'raTextBlock', title: { content: ['Состояние'] } });
  });

  it('falls back to text blocks + the cover when there is one photo (chess needs 2 rows)', () => {
    const j = JSON.parse(buildRichContent(book, photos.slice(0, 1)));
    expect(j.content.map((w: any) => w.widgetName)).toEqual(['raTextBlock', 'raTextBlock', 'raTextBlock', 'raShowcase']);
    expect(j.content[3].blocks[0].img).toMatchObject({ src: 'https://s/0.jpg', position: 'width_full' });
  });
});
