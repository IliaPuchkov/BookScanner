import { ANNOTATION_PREFIX } from '@bookscanner/shared';
import type { Book } from '../../books/entities/book.entity';

/** «Rich-контент JSON» — same id in both our book categories */
export const OZON_ATTR_RICH_CONTENT = 11254;

/**
 * Ozon has no public schema for this attribute. What is known to pass validation: a root
 * `{ content: [...], version: 0.3 }` (without `version` → invalid_rich_content_json),
 * images inside `raShowcase` widgets (`raImage` is deprecated), every `img` with
 * src/srcMobile/alt/position/positionMobile/widthMobile/heightMobile.
 */
export const RICH_CONTENT_VERSION = 0.3;

export interface RichPhoto {
  url: string;
  width?: number | null;
  height?: number | null;
}

type BookFields = Pick<
  Book,
  | 'title'
  | 'author'
  | 'publisher'
  | 'yearPublished'
  | 'coverType'
  | 'paperType'
  | 'pageCount'
  | 'printRun'
  | 'language'
  | 'isbn'
  | 'condition'
  | 'annotation'
>;

const COVER_LABEL: Record<string, string> = {
  'твердый переплет': 'Твердый переплет',
  'мягкий переплет': 'Мягкая обложка',
};
const PAPER_LABEL: Record<string, string> = {
  офсетная: 'Офсетная',
  глянцевая: 'Мелованная глянцевая',
  матовая: 'Мелованная матовая',
};

/** Fallback when a photo's size is unknown: our photos are mostly portrait 3:4 */
const DEFAULT_PHOTO = { width: 1200, height: 1600 };

const textBlock = (title: string, lines: string[]) => ({
  widgetName: 'raTextBlock',
  title: { content: [title], size: 'size4', color: 'color1' },
  theme: 'default',
  padding: 'type2',
  gapSize: 'm',
  text: { size: 'size2', align: 'left', color: 'color1', content: lines },
});

const photoBlock = (photo: RichPhoto, alt: string) => {
  const width = photo.width || DEFAULT_PHOTO.width;
  const height = photo.height || DEFAULT_PHOTO.height;
  return {
    widgetName: 'raShowcase',
    type: 'roll',
    blocks: [
      {
        imgLink: '',
        img: {
          src: photo.url,
          srcMobile: photo.url,
          alt,
          position: 'width_full',
          positionMobile: 'width_full',
          widthMobile: width,
          heightMobile: height,
        },
      },
    ],
  };
};

/** The annotation as the buyer should read it: without our «ВНИМАНИЕ! Книга не новая…» notice and links. */
export function cleanAnnotation(annotation: string | null | undefined): string {
  let text = (annotation || '').replace(/\r\n/g, '\n').trim();
  const prefix = ANNOTATION_PREFIX.trim();
  if (text.startsWith(prefix)) text = text.slice(prefix.length);
  // older / hand-edited cards: the notice may differ slightly — drop it up to «экземпляра.»
  text = text.replace(/^ВНИМАНИЕ!\s*Книга не новая![\s\S]*?(экземпляра\.|на фото\.)/i, '');
  return text
    .replace(/(https?:\/\/\S+|www\.\S+)/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function formatNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** «Об издании» lines; only filled fields. */
export function editionLines(book: BookFields): string[] {
  const lines: string[] = [];
  const add = (label: string, value: unknown) => {
    if (value !== null && value !== undefined && String(value).trim()) lines.push(`${label}: ${String(value).trim()}`);
  };
  add('Автор', book.author && !/^(не указан|неизвестен)$/i.test(book.author.trim()) ? book.author : null);
  add('Издательство', book.publisher);
  add('Год издания', book.yearPublished);
  add('Переплёт', book.coverType ? COVER_LABEL[book.coverType] ?? book.coverType : null);
  add('Бумага', book.paperType ? PAPER_LABEL[book.paperType] ?? book.paperType : null);
  add('Страниц', book.pageCount || null);
  add('Тираж', book.printRun ? `${formatNumber(book.printRun)} экз.` : null);
  add('Язык', book.language);
  add('ISBN', book.isbn);
  return lines;
}

/** One «chess» row: half-width photo with a titled text beside it. */
const chessBlock = (photo: RichPhoto, alt: string, title: string, lines: string[], reverse: boolean) => {
  const width = photo.width || DEFAULT_PHOTO.width;
  const height = photo.height || DEFAULT_PHOTO.height;
  return {
    imgLink: '',
    img: { src: photo.url, srcMobile: photo.url, alt, width, height, widthMobile: width, heightMobile: height },
    title: { content: [title], size: 'size4', align: 'left', color: 'color1' },
    text: { size: 'size2', align: 'left', color: 'color1', content: lines },
    reverse,
  };
};

/** The text sections of the rich content, in display order (empty ones left out). */
export function richSections(book: BookFields): Array<{ title: string; lines: string[] }> {
  const sections: Array<{ title: string; lines: string[] }> = [];
  const about = cleanAnnotation(book.annotation)
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean);
  if (about.length) sections.push({ title: 'О книге', lines: about });
  const edition = editionLines(book);
  if (edition.length) sections.push({ title: 'Об издании', lines: edition });
  sections.push({
    title: 'Состояние',
    lines: [
      `Сохранность: ${book.condition || 'хорошая'}.`,
      'Книга не новая — это букинистическое издание. Все особенности экземпляра видны на фотографиях.',
      'При необходимости мы можем добавить больше фотографий для оценки состояния экземпляра.',
    ],
  });
  return sections;
}

/**
 * Rich content for a used book as a «chess» layout: each section («О книге», «Об издании»,
 * «Состояние») beside a half-width photo, sides alternating — cover first. Photos beyond the
 * sections stay only in the product gallery. With fewer than 2 photos (chess needs 2–6 rows)
 * the sections are plain text blocks. Returns the JSON string for attribute 11254.
 */
export function buildRichContent(book: BookFields, photos: RichPhoto[]): string {
  const sections = richSections(book);
  const alt = (i: number) => (i === 0 ? `${book.title} — обложка` : `${book.title} — фото ${i + 1}`);
  const rows = Math.min(sections.length, photos.length);
  const content: unknown[] = [];

  if (rows >= 2) {
    content.push({
      widgetName: 'raShowcase',
      type: 'chess',
      blocks: sections
        .slice(0, rows)
        .map((s, i) => chessBlock(photos[i], alt(i), s.title, s.lines, i % 2 === 1)),
    });
    for (const s of sections.slice(rows)) content.push(textBlock(s.title, s.lines));
  } else {
    for (const s of sections) content.push(textBlock(s.title, s.lines));
    if (photos[0]) content.push(photoBlock(photos[0], alt(0)));
  }

  return JSON.stringify({ content, version: RICH_CONTENT_VERSION });
}
