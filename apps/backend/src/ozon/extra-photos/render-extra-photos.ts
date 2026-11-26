import sharp from 'sharp';
import * as path from 'path';
import { createHash } from 'crypto';
import { cleanAnnotation, editionLines } from '../rich-content/rich-content.builder';
import type { Book } from '../../books/entities/book.entity';

/**
 * Extra photos for Ozon (it wants 8, photographers shoot 4): «Об издании», «О книге»,
 * «Состояние» and the shop's note, 1200×1600 JPEG. Ozon rules (fines for a breach): every image
 * must show the product → each one carries the book's own cover photo; no prices, contacts,
 * delivery or return info, calls to action.
 */
export const EXTRA_PHOTOS = {
  WIDTH: 1200,
  HEIGHT: 1600,
  /** bump when the design changes: the hash changes and covers get redrawn */
  TEMPLATE: 1,
  QUALITY: 86,
};

export type ExtraPhotoBook = Pick<
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

/** Russian shop name on the images, by Ozon store name. */
const SHOP_NAMES: Record<string, string> = {
  'jolly white': 'Джолли Уайт',
  'jolly hunter': 'Джолли Хантер',
};
export function shopName(storeName: string | null | undefined): string {
  return SHOP_NAMES[(storeName ?? '').trim().toLowerCase()] ?? 'Джолли Бук';
}

/** Identifies what the images were drawn from: another hash = outdated images. */
export function extraPhotosHash(book: ExtraPhotoBook, photoUrls: string[], shop: string): string {
  const data = JSON.stringify([
    EXTRA_PHOTOS.TEMPLATE,
    shop,
    photoUrls,
    book.title, book.author, book.publisher, book.yearPublished, book.coverType, book.paperType,
    book.pageCount, book.printRun, book.language, book.isbn, book.condition, book.annotation,
  ]);
  return createHash('sha1').update(data).digest('hex').slice(0, 16);
}

const W = EXTRA_PHOTOS.WIDTH;
const H = EXTRA_PHOTOS.HEIGHT;
const PAD = 90;
const BG = '#F6F1E7';
const INK = '#2A2723';
const MUTED = '#7A7268';
const RULE = '#DDD3C2';
const ACCENT = '#8E1B17';
const CREAM = '#F3E9D8';

const FONT_DIR = path.resolve(__dirname, '../../../assets/fonts');
const FONTS = {
  serif: ['PT Serif', 'PT_Serif-Web-Regular.ttf'],
  serifBold: ['PT Serif Bold', 'PT_Serif-Web-Bold.ttf'],
  sans: ['PT Sans', 'PT_Sans-Web-Regular.ttf'],
  sansBold: ['PT Sans Bold', 'PT_Sans-Web-Bold.ttf'],
  hand: ['Caveat', 'Caveat.ttf'],
  display: ['Amatic SC Bold', 'AmaticSC-Bold.ttf'],
} as const;
type Font = keyof typeof FONTS;

interface TextImage {
  buf: Buffer;
  width: number;
  height: number;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const centre = (w: number) => Math.round((W - w) / 2);
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function text(
  t: string,
  font: Font,
  size: number,
  color: string,
  width: number,
  align: 'left' | 'centre' = 'left',
): Promise<TextImage> {
  const [family, file] = FONTS[font];
  const buf = await sharp({
    text: {
      text: `<span foreground="${color}">${esc(t)}</span>`,
      font: `${family} ${size}`,
      fontfile: path.join(FONT_DIR, file),
      width,
      rgba: true,
      dpi: 72,
      wrap: 'word',
      align,
      spacing: font === 'hand' || font === 'display' ? 0 : Math.round(size * 0.3),
    },
  })
    .png()
    .toBuffer();
  const meta = await sharp(buf).metadata();
  return { buf, width: meta.width ?? 0, height: meta.height ?? 0 };
}

/** Largest size that fits `maxH`; at the smallest size drops trailing sentences, then words («…»). */
export async function fitText(
  t: string,
  font: Font,
  sizes: number[],
  color: string,
  width: number,
  maxH: number,
  align: 'left' | 'centre' = 'left',
): Promise<TextImage> {
  for (const size of sizes) {
    const r = await text(t, font, size, color, width, align);
    if (r.height <= maxH) return r;
  }
  const size = sizes[sizes.length - 1];
  let sentences = t.split(/(?<=[.!?…])\s+/);
  while (sentences.length > 1) {
    sentences = sentences.slice(0, -1);
    const r = await text(sentences.join(' '), font, size, color, width, align);
    if (r.height <= maxH) return r;
  }
  let words = t.split(/\s+/);
  while (words.length > 3) {
    words = words.slice(0, Math.floor(words.length * 0.85));
    const r = await text(words.join(' ') + '…', font, size, color, width, align);
    if (r.height <= maxH) return r;
  }
  return text(words.join(' ') + '…', font, size, color, width, align);
}

const rect = (w: number, h: number, color: string) =>
  sharp({ create: { width: w, height: h, channels: 4, background: color } }).png().toBuffer();

const fitPhoto = (photo: Buffer, w: number, h: number) =>
  sharp(photo).rotate().resize(w, h, { fit: 'cover' }).jpeg({ quality: 90 }).toBuffer();

/** A photo as a print: white border, soft shadow, optional tilt. */
async function print(photo: Buffer, w: number, h: number, angle: number, border = 16): Promise<Buffer> {
  const card = await sharp({ create: { width: w + 2 * border, height: h + 2 * border, channels: 4, background: '#FFFFFF' } })
    .composite([{ input: await fitPhoto(photo, w, h), left: border, top: border }])
    .png()
    .toBuffer();
  const shadow = await sharp({ create: { width: w + 2 * border + 60, height: h + 2 * border + 60, channels: 4, background: TRANSPARENT } })
    .composite([{ input: await rect(w + 2 * border, h + 2 * border, '#00000066'), left: 34, top: 38 }])
    .blur(14)
    .png()
    .toBuffer();
  const both = await sharp(shadow).composite([{ input: card, left: 30, top: 30 }]).png().toBuffer();
  return angle ? sharp(both).rotate(angle, { background: TRANSPARENT }).png().toBuffer() : both;
}

const jpeg = (layers: sharp.OverlayOptions[], background: string | Buffer) =>
  (typeof background === 'string'
    ? sharp({ create: { width: W, height: H, channels: 3, background } })
    : sharp(background)
  )
    .composite(layers)
    .jpeg({ quality: EXTRA_PHOTOS.QUALITY, mozjpeg: true })
    .toBuffer();

/** Accent stripe, cover thumbnail, label, title, author; shop name at the bottom. */
async function infoFrame(label: string, book: ExtraPhotoBook, cover: Buffer, shop: string) {
  const layers: sharp.OverlayOptions[] = [{ input: await rect(W, 18, ACCENT), top: 0, left: 0 }];
  const cw = 250;
  const ch = 333;
  layers.push({ input: await fitPhoto(cover, cw, ch), top: 80, left: PAD });
  const tx = PAD + cw + 50;
  const tw = W - tx - PAD;
  let y = 84;
  const lab = await text(label.toUpperCase(), 'sansBold', 34, ACCENT, tw);
  layers.push({ input: lab.buf, top: y, left: tx });
  y += lab.height + 22;
  const title = await fitText(book.title || 'Без названия', 'serifBold', [54, 48, 42, 36], INK, tw, 200);
  layers.push({ input: title.buf, top: y, left: tx });
  y += title.height + 12;
  const author = knownAuthor(book.author);
  if (author && y < 80 + ch - 30) {
    const a = await fitText(author, 'serif', [40, 34], MUTED, tw, 80 + ch + 20 - y);
    layers.push({ input: a.buf, top: y, left: tx });
    y += a.height;
  }
  y = Math.max(y, 80 + ch) + 50;
  layers.push({ input: await rect(W - 2 * PAD, 3, RULE), top: y, left: PAD });
  y += 50;
  const foot = await text(shop, 'sansBold', 34, ACCENT, W - 2 * PAD);
  layers.push({ input: foot.buf, top: H - 64 - foot.height, left: centre(foot.width) });
  return { layers, y, bottom: H - 64 - foot.height - 50 };
}

function knownAuthor(author: string | null | undefined): string | null {
  const a = (author ?? '').trim();
  return a && !/^(не указан|неизвестен|коллектив авторов)$/i.test(a) ? a : null;
}

async function editionCard(book: ExtraPhotoBook, cover: Buffer, shop: string): Promise<Buffer | null> {
  const lines = editionLines(book).filter((l) => !l.startsWith('Автор:'));
  if (!lines.length) return null;
  const f = await infoFrame('Об издании', book, cover, shop);
  const cw = W - 2 * PAD;
  let y = f.y;
  for (const line of lines) {
    const [label, ...rest] = line.split(': ');
    const l = await text(label, 'sans', 40, MUTED, 380);
    const v = await fitText(rest.join(': '), 'serifBold', [46, 40], INK, cw - 400, 120);
    if (y + Math.max(l.height, v.height) > f.bottom) break;
    f.layers.push({ input: l.buf, top: y + 6, left: PAD }, { input: v.buf, top: y, left: PAD + 400 });
    y += Math.max(l.height, v.height) + 30;
    if (y > f.bottom - 70) break;
    f.layers.push({ input: await rect(cw, 2, RULE), top: y, left: PAD });
    y += 32;
  }
  return jpeg(f.layers, BG);
}

async function aboutCard(book: ExtraPhotoBook, cover: Buffer, shop: string): Promise<Buffer | null> {
  const about = cleanAnnotation(book.annotation).replace(/\s*\n+\s*/g, ' ').trim();
  if (about.length < 40) return null;
  const f = await infoFrame('О книге', book, cover, shop);
  const t = await fitText(about, 'serif', [56, 52, 48, 44, 40, 36], INK, W - 2 * PAD, f.bottom - f.y);
  f.layers.push({ input: t.buf, top: f.y, left: PAD });
  return jpeg(f.layers, BG);
}

async function conditionCard(book: ExtraPhotoBook, photos: Buffer[], shop: string): Promise<Buffer> {
  const f = await infoFrame('Состояние', book, photos[0], shop);
  const cw = W - 2 * PAD;
  let y = f.y;
  const c = await text(`Сохранность: ${(book.condition || 'хорошая').toLowerCase()}`, 'serifBold', 50, INK, cw);
  f.layers.push({ input: c.buf, top: y, left: PAD });
  y += c.height + 24;
  const n = await text('Книга не новая. На фотографиях — именно этот экземпляр.', 'serif', 40, INK, cw);
  f.layers.push({ input: n.buf, top: y, left: PAD });
  y += n.height + 40;
  const shots = (photos.length > 1 ? photos.slice(1, 4) : photos).slice(0, 3);
  const gap = 24;
  const tw = Math.floor((cw - gap * (shots.length - 1)) / shots.length);
  const th = Math.max(Math.min(Math.round(tw * (shots.length === 1 ? 0.75 : 4 / 3)), f.bottom - y), 50);
  for (let i = 0; i < shots.length; i++) {
    f.layers.push({ input: await fitPhoto(shots[i], tw, th), top: y, left: PAD + i * (tw + gap) });
  }
  return jpeg(f.layers, BG);
}

async function burgundyBackground(): Promise<Buffer> {
  const grain = await sharp({ create: { width: W, height: H, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } } })
    .blur(1.2)
    .greyscale()
    .png()
    .toBuffer();
  const vignette = Buffer.from(
    `<svg width="${W}" height="${H}"><defs><radialGradient id="g" cx="50%" cy="45%" r="75%">` +
      `<stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#000" stop-opacity="0.35"/>` +
      `</radialGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  return sharp({ create: { width: W, height: H, channels: 3, background: ACCENT } })
    .composite([{ input: await sharp(grain).ensureAlpha(0.07).png().toBuffer(), blend: 'overlay' }, { input: vignette }])
    .png()
    .toBuffer();
}

const pin = (d: number) =>
  Buffer.from(
    `<svg width="${d}" height="${d}"><defs><radialGradient id="p" cx="38%" cy="35%" r="65%">` +
      `<stop offset="0" stop-color="#E25A50"/><stop offset="1" stop-color="#7A0E0A"/></radialGradient></defs>` +
      `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2 - 4}" fill="url(#p)"/></svg>`,
  );

/** The shop's note: name, slogan, a pinned note, the book's cover as a pinned print, three promises. */
async function noteCard(cover: Buffer, shop: string): Promise<Buffer> {
  const cw = W - 2 * PAD;
  const layers: sharp.OverlayOptions[] = [];
  const name = await fitText(shop.toUpperCase(), 'display', [190, 160, 130], CREAM, cw, 230, 'centre');
  layers.push({ input: name.buf, top: 50, left: centre(name.width) });
  const slogan = await text('возвращаем книгам дом', 'hand', 78, CREAM, cw, 'centre');
  layers.push({ input: slogan.buf, top: 40 + name.height, left: centre(slogan.width) });

  const nw = 800;
  const nh = 720;
  const tornPath = (
    'M8,22 L60,10 L120,18 L200,6 L290,16 L380,4 L470,14 L560,6 L650,16 L752,8 L746,120 L756,240 L744,380 ' +
    'L754,520 L748,632 L640,622 L540,634 L420,624 L300,636 L180,624 L70,634 L10,626 L18,500 L6,360 L16,220 L4,100 Z'
  ).replace(/(\d+),(\d+)/g, (_, x, y) => `${Math.round((+x * nw) / 760)},${Math.round((+y * nh) / 640)}`);
  const tornSvg = (fill: string, opacity = 1) =>
    Buffer.from(`<svg width="${nw}" height="${nh}"><path d="${tornPath}" fill="${fill}" fill-opacity="${opacity}"/></svg>`);
  const noteText = await fitText(
    'У нас любая история найдёт своего читателя: от винтажного издания до полюбившейся классики.\n\n' +
      'Мы подберём книгу, которая отзовётся и станет по-настоящему вашей.',
    'hand',
    [54, 50, 46, 42],
    '#2A2420',
    nw - 120,
    nh - 120,
    'centre',
  );
  const note = await sharp({ create: { width: nw, height: nh, channels: 4, background: TRANSPARENT } })
    .composite([
      { input: tornSvg('#EDE3D1') },
      { input: noteText.buf, top: Math.round((nh - noteText.height) / 2) + 10, left: Math.round((nw - noteText.width) / 2) },
    ])
    .png()
    .toBuffer();
  const shadow = await sharp({ create: { width: nw + 60, height: nh + 60, channels: 4, background: TRANSPARENT } })
    .composite([{ input: tornSvg('#000', 0.45), left: 40, top: 46 }])
    .blur(18)
    .png()
    .toBuffer();
  const noteAll = await sharp(shadow)
    .composite([{ input: note, left: 30, top: 30 }])
    .rotate(-3, { background: TRANSPARENT })
    .png()
    .toBuffer();
  layers.push({ input: noteAll, top: 400, left: 30 });
  layers.push({ input: pin(70), top: 432, left: 420 });
  layers.push({ input: await print(cover, 300, 400, 6), top: 790, left: 800 });
  layers.push({ input: pin(60), top: 808, left: 975 });

  const items = ['фотографируем конкретный экземпляр', 'внимательно отбираем', 'бережно упаковываем'];
  const bw = Math.floor((cw - 2 * 24) / 3);
  const bh = 170;
  const by = H - 60 - bh;
  for (let i = 0; i < items.length; i++) {
    const box = Buffer.from(
      `<svg width="${bw}" height="${bh}"><rect x="1.5" y="1.5" width="${bw - 3}" height="${bh - 3}" rx="22" ` +
        `fill="none" stroke="${CREAM}" stroke-opacity="0.45" stroke-width="2"/></svg>`,
    );
    // a drawn tick: the handwriting font has no «✓», and the server has no fallback font
    const tick = Buffer.from(
      `<svg width="34" height="34"><path d="M5,18 L14,27 L30,7" fill="none" stroke="${CREAM}" ` +
        `stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    );
    const t = await text(items[i], 'hand', 40, CREAM, bw - 90, 'centre');
    const left = PAD + i * (bw + 24) + Math.round((bw - t.width - 44) / 2);
    const top = by + Math.round((bh - t.height) / 2);
    layers.push({ input: box, top: by, left: PAD + i * (bw + 24) });
    layers.push({ input: tick, top: by + Math.round((bh - 34) / 2), left });
    layers.push({ input: t.buf, top, left: left + 44 });
  }
  return jpeg(layers, await burgundyBackground());
}

/**
 * The extra photos of one book, in gallery order. `photos` = the book's own photos in display
 * order (at least one, the cover first). Cards without content (no annotation, no edition data)
 * are left out, so 2–4 images come back.
 */
export async function renderExtraPhotos(book: ExtraPhotoBook, photos: Buffer[], shop: string): Promise<Buffer[]> {
  if (!photos.length) throw new Error('renderExtraPhotos: the book has no photos');
  const cover = photos[0];
  const cards = [
    await editionCard(book, cover, shop),
    await aboutCard(book, cover, shop),
    await conditionCard(book, photos, shop),
    await noteCard(cover, shop),
  ];
  return cards.filter((c): c is Buffer => !!c);
}
