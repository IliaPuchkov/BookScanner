import sharp from 'sharp';
import { EXTRA_PHOTOS, extraPhotosHash, renderExtraPhotos, shopName, type ExtraPhotoBook } from './render-extra-photos';

const book: ExtraPhotoBook = {
  title: 'Записки о Пушкине. Письма',
  author: 'И.И. Пущин',
  publisher: 'Советская Россия',
  yearPublished: 1979,
  coverType: 'твердый переплет',
  paperType: 'офсетная',
  pageCount: 144,
  printRun: 100000,
  language: 'Русский',
  isbn: null as unknown as string,
  condition: 'Хорошая',
  annotation:
    'ВНИМАНИЕ! Книга не новая! Состояние - на фото.\n\nВ большой и разнообразной мемуарной литературе о Пушкине ' +
    'воспоминания Ивана Ивановича Пущина выделяются особой достоверностью.',
} as ExtraPhotoBook;

const photo = (color: string) =>
  sharp({ create: { width: 600, height: 800, channels: 3, background: color } }).jpeg().toBuffer();

describe('extra photos', () => {
  jest.setTimeout(60_000);

  it('names the shop in Russian, «Джолли Бук» for an unknown store', () => {
    expect(shopName('Jolly White')).toBe('Джолли Уайт');
    expect(shopName(' jolly hunter ')).toBe('Джолли Хантер');
    expect(shopName('Jolly Red')).toBe('Джолли Бук');
    expect(shopName(null)).toBe('Джолли Бук');
  });

  it('changes the hash when the data, the photos or the shop change', () => {
    const h = extraPhotosHash(book, ['a', 'b'], 'Джолли Уайт');
    expect(h).toHaveLength(16);
    expect(extraPhotosHash(book, ['a', 'b'], 'Джолли Уайт')).toBe(h);
    expect(extraPhotosHash({ ...book, condition: 'Отличная' }, ['a', 'b'], 'Джолли Уайт')).not.toBe(h);
    expect(extraPhotosHash(book, ['b', 'a'], 'Джолли Уайт')).not.toBe(h);
    expect(extraPhotosHash(book, ['a', 'b'], 'Джолли Хантер')).not.toBe(h);
  });

  it('draws four 1200×1600 JPEGs', async () => {
    const photos = await Promise.all(['#2f5d3a', '#dddddd', '#cccccc', '#bbbbbb'].map(photo));
    const images = await renderExtraPhotos(book, photos, 'Джолли Уайт');
    expect(images).toHaveLength(4);
    for (const img of images) {
      const meta = await sharp(img).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', EXTRA_PHOTOS.WIDTH, EXTRA_PHOTOS.HEIGHT]);
    }
  });

  it('leaves out «О книге» without an annotation and works with a single photo', async () => {
    const images = await renderExtraPhotos({ ...book, annotation: '' }, [await photo('#2f5d3a')], 'Джолли Уайт');
    expect(images).toHaveLength(3);
  });

  it('refuses a book without photos', async () => {
    await expect(renderExtraPhotos(book, [], 'Джолли Уайт')).rejects.toThrow();
  });
});
