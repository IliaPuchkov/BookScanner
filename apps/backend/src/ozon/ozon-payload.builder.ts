import { Book } from "../books/entities/book.entity";
import { formatDimensions } from "@bookscanner/shared";
import { applyHashtagRules } from "../settings/hashtag-rules";
import { fillDefaults, type CardDefaults, type CardDefaultableValues } from "../card/card-defaults";
import type {
  OzonAttrRule,
  OzonCardField,
  OzonPayloadConfig,
  OzonBuiltin,
} from "./payload/ozon-payload-config";

/**
 * Card → Ozon import item, driven by `ozon_payload_config` (see payload/ozon-payload-config.ts).
 * The card is already processed (AI + card defaults); empty fields of older cards still get the
 * card defaults here. Item-level fields (offer_id, price, weight, dimensions) stay in code.
 */

type AttrValue = { value: string; dictionary_value_id?: number };

interface OzonAttribute {
  complex_id: number;
  id: number;
  values: AttrValue[];
}

export interface ResolvedOzonData {
  brandDictValueId?: number;
  resolvedBrandName?: string;
  publisherDictValueId?: number;
  resolvedPublisherName?: string;
  authors?: Array<{ value: string; dictValueId?: number }>;
  /** Hashtags after the hashtag rules (`applyHashtagRules`); without it — book.hashtags, format check only */
  hashtags?: string[];
  /** «Rich-контент JSON» (attribute 11254) from RichContentService.forPublish; null/undefined — not sent */
  richContent?: string | null;
  /** Generated extra photos (ExtraPhotosService.forPublish), appended after the book's own photos */
  extraImages?: string[];
}

export interface OzonPayloadReport {
  payload: Record<string, unknown>;
  /** Attributes left out or sent empty, for the «Проверить на книге» screen */
  warnings: string[];
  /** The sent attributes in a readable form (label from the config) */
  rows: Array<{ id: number; label: string; value: string }>;
}

function value(v: string, dictId?: number | null): AttrValue {
  const out: AttrValue = { value: v };
  if (dictId) out.dictionary_value_id = dictId;
  return out;
}

function mapValue(rule: OzonAttrRule, v: AttrValue): AttrValue {
  if (!rule.valueMap?.length || v.dictionary_value_id) return v;
  const needle = v.value.trim().toLowerCase();
  const hit = rule.valueMap.find((m) => m.from.trim().toLowerCase() === needle);
  return hit ? value(hit.to, hit.dictionaryValueId) : v;
}

function annotationText(book: Book, config: OzonPayloadConfig): string {
  const { prefix, stripLinks } = config.annotation;
  const text = (book.annotation || "").trim();
  // Older cards carry the prefix in the text already
  const head = prefix.trim().slice(0, 30);
  let out = head && text.startsWith(head) ? text : `${prefix}${text}`;
  if (stripLinks) out = out.replace(/(https?:\/\/\S+|www\.\S+)/gi, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

export function buildOzonPayloadReport(
  book: Book,
  resolved: ResolvedOzonData,
  config: OzonPayloadConfig,
  cardDefaults: CardDefaults,
): OzonPayloadReport {
  const { values: filled } = fillDefaults(book as unknown as CardDefaultableValues, cardDefaults);
  const dimensions = {
    width: Math.round(filled.dimensions.width), // ширина
    height: Math.round(filled.dimensions.height), // длина
    depth: Math.round(filled.dimensions.depth), // толщина
  };
  const weight = Math.round(filled.weightGross);

  const fieldValue = (f: OzonCardField): string | null => {
    switch (f) {
      case "weightGross":
        return String(weight);
      case "paperType":
      case "coverType":
      case "language":
      case "condition":
      case "bookType":
      case "direction":
        return filled[f];
      default: {
        const v = (book as unknown as Record<string, unknown>)[f];
        return v == null || v === "" ? null : String(v);
      }
    }
  };

  const builtinValues = (b: OzonBuiltin): AttrValue[] => {
    switch (b) {
      case "brand":
        return [value(resolved.resolvedBrandName ?? "Нет бренда", resolved.brandDictValueId)];
      case "publisher":
        return resolved.resolvedPublisherName && resolved.publisherDictValueId
          ? [value(resolved.resolvedPublisherName, resolved.publisherDictValueId)]
          : [];
      case "authors":
        // strict dictionary attribute: only authors Ozon knows
        return (resolved.authors ?? [])
          .filter((a) => a.dictValueId)
          .map((a) => value(a.value, a.dictValueId));
      case "authorCover":
        return [
          value(
            resolved.authors?.length
              ? resolved.authors.map((a) => a.value).join(";")
              : book.author || "Не указан",
          ),
        ];
      case "annotation":
        return [value(annotationText(book, config))];
      case "hashtags": {
        const tags = resolved.hashtags ?? applyHashtagRules(book.hashtags, []);
        return tags.length ? [value(tags.join(" "))] : [];
      }
      case "richContent":
        return resolved.richContent ? [value(resolved.richContent)] : [];
      case "dimensions":
        // Ozon: Д x Ш x В — длина = height книги, ширина = width, высота = depth
        return [value(formatDimensions(dimensions.height, dimensions.width, dimensions.depth))];
    }
  };

  const attributes: OzonAttribute[] = [];
  const warnings: string[] = [];
  const rows: OzonPayloadReport["rows"] = [];

  for (const rule of config.attributes) {
    if (!rule.enabled) continue;
    const s = rule.source;
    let values: AttrValue[];
    if (s.kind === "const") values = [value(s.value, s.dictionaryValueId)];
    else if (s.kind === "builtin") values = builtinValues(s.builtin);
    else {
      const v = fieldValue(s.field);
      values = v == null ? [] : [value(v)];
    }
    values = values.map((v) => mapValue(rule, v)).filter((v) => v.value !== "" || !rule.skipIfEmpty);

    if (values.length === 0) {
      if (rule.skipIfEmpty) {
        warnings.push(
          `${rule.system ? "Ошибка: обязательный " : ""}«${rule.label}» (${rule.id}) пустой — не отправлен`,
        );
        continue;
      }
      values = [value("")];
    }
    if (values.every((v) => v.value === "")) {
      warnings.push(`${rule.system ? "Ошибка: обязательный " : ""}«${rule.label}» (${rule.id}) отправлен пустым`);
    }
    attributes.push({ complex_id: 0, id: rule.id, values });
    rows.push({
      id: rule.id,
      label: rule.label,
      value: values
        .map((v) => (v.dictionary_value_id ? `${v.value} [${v.dictionary_value_id}]` : v.value))
        .join("; "),
    });
  }

  const year = book.yearPublished ?? 0;
  const category =
    config.categories.find(
      (c) => (c.yearFrom == null || year >= c.yearFrom) && (c.yearTo == null || year <= c.yearTo),
    ) ?? config.categories[0];

  const images =
    book.photos
      ?.sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => p.fileUrl) || [];
  if (resolved.extraImages?.length) images.push(...resolved.extraImages);
  images.splice(config.maxImages);

  return {
    payload: {
      items: [
        {
          description_category_id: category.descriptionCategoryId,
          type_id: category.typeId,
          name: book.title,
          offer_id: book.sku,
          price: String(book.price || 0),
          vat: config.vat,
          weight: Number(weight),
          weight_unit: "g",
          width: dimensions.width, // высота книги → ширина Озон
          height: dimensions.depth, // ширина книги → длина Озон
          depth: dimensions.height,
          dimension_unit: "mm",
          images,
          attributes,
        },
      ],
    },
    warnings,
    rows,
  };
}

export function buildOzonImportPayload(
  book: Book,
  resolved: ResolvedOzonData,
  config: OzonPayloadConfig,
  cardDefaults: CardDefaults,
): Record<string, unknown> {
  return buildOzonPayloadReport(book, resolved, config, cardDefaults).payload;
}
