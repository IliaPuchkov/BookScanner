export enum PaperType {
  OFFSET = 'офсетная',
  GLOSSY = 'глянцевая',
  MATTE = 'матовая',
}

export enum CoverType {
  HARDCOVER = 'твердый переплет',
  SOFTCOVER = 'мягкий переплет',
}

export enum BookCondition {
  GOOD = 'Хорошая',
}

export enum Language {
  RUSSIAN = 'русский',
  ENGLISH = 'английский',
}

export interface IBookDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface IBookCard {
  id: string;
  sku: string;
  boxId: string;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  yearPublished: number | null;
  dimensions: IBookDimensions | null;
  weightGross: number | null;
  weightNet: number | null;
  paperType: PaperType;
  coverType: CoverType;
  pageCount: number | null;
  language: string;
  price: number;
  annotation: string | null;
  hashtags: string[];
  condition: string;
  bookType: string;
  direction: string;
  createdById: string;
  publishedToOzon: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
