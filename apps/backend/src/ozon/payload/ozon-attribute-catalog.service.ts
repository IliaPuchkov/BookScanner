import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OzonApiClient, OzonApiError, type OzonCategoryAttribute } from '../ozon-api.client';
import { OzonPayloadConfigService } from './ozon-payload-config.service';
import type { OzonCategoryRule } from './ozon-payload-config';

/** An Ozon attribute as the picker shows it: merged over the categories of the payload config. */
export interface CatalogAttribute {
  id: number;
  name: string;
  description: string;
  type: string;
  isRequired: boolean;
  isCollection: boolean;
  /** 0 — free text */
  dictionaryId: number;
  groupName: string;
  /** part of a complex attribute — the payload config can't send it (complex 0 only) */
  complex: boolean;
  /** labels of the config categories that have it */
  categories: string[];
  /** required in at least one of them */
  requiredIn: string[];
  /** key of the payload-config attribute with this id, if any */
  usedBy: string | null;
}

function ozonMessage(e: unknown): string {
  if (e instanceof OzonApiError) {
    try {
      const body = JSON.parse(e.responseBody);
      if (body?.message) return `Ozon: ${body.message}`;
    } catch {
      /* not JSON */
    }
    return `Ozon ответил ошибкой ${e.statusCode}`;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Ozon's attribute catalogue for the attribute picker of «Сборка карточки Ozon». */
@Injectable()
export class OzonAttributeCatalogService {
  private readonly logger = new Logger(OzonAttributeCatalogService.name);

  constructor(
    private readonly ozonApiClient: OzonApiClient,
    private readonly configService: OzonPayloadConfigService,
  ) {}

  private async categories(): Promise<OzonCategoryRule[]> {
    const config = await this.configService.get();
    // the same category/type pair may serve several year ranges
    const seen = new Set<string>();
    return config.categories.filter((c) => {
      const k = `${c.descriptionCategoryId}:${c.typeId}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  private async load(cat: OzonCategoryRule): Promise<OzonCategoryAttribute[]> {
    try {
      return await this.ozonApiClient.getCategoryAttributes(cat.descriptionCategoryId, cat.typeId);
    } catch (e) {
      this.logger.warn(`attributes of ${cat.descriptionCategoryId}/${cat.typeId}: ${ozonMessage(e)}`);
      throw new BadRequestException(`Не удалось получить атрибуты категории «${cat.label}». ${ozonMessage(e)}`);
    }
  }

  /** Every attribute of every category in the payload config, merged by id. */
  async listAttributes(): Promise<{ categories: string[]; attributes: CatalogAttribute[] }> {
    const [cats, config] = await Promise.all([this.categories(), this.configService.get()]);
    const used = new Map(config.attributes.map((a) => [a.id, a.key]));
    const byId = new Map<number, CatalogAttribute>();
    for (const cat of cats) {
      for (const a of await this.load(cat)) {
        let row = byId.get(a.id);
        if (!row) {
          row = {
            id: a.id,
            name: a.name,
            description: a.description ?? '',
            type: a.type ?? '',
            isRequired: false,
            isCollection: !!a.is_collection,
            dictionaryId: a.dictionary_id ?? 0,
            groupName: a.group_name ?? '',
            complex: !!a.attribute_complex_id,
            categories: [],
            requiredIn: [],
            usedBy: used.get(a.id) ?? null,
          };
          byId.set(a.id, row);
        }
        row.categories.push(cat.label);
        if (a.is_required) {
          row.isRequired = true;
          row.requiredIn.push(cat.label);
        }
      }
    }
    const attributes = [...byId.values()].sort(
      (a, b) => Number(b.isRequired) - Number(a.isRequired) || a.name.localeCompare(b.name, 'ru'),
    );
    return { categories: cats.map((c) => c.label), attributes };
  }

  /** Dictionary values of an attribute, searched in the first config category that has it. */
  async searchValues(attributeId: number, query: string) {
    for (const cat of await this.categories()) {
      const meta = (await this.load(cat)).find((a) => a.id === attributeId);
      if (!meta) continue;
      if (!meta.dictionary_id) {
        throw new BadRequestException('У этого атрибута нет словаря Ozon — значение вводится текстом');
      }
      try {
        const res = await this.ozonApiClient.searchAttributeValues(
          attributeId,
          cat.descriptionCategoryId,
          cat.typeId,
          query,
        );
        return { ...res, category: cat.label };
      } catch (e) {
        throw new BadRequestException(`Не удалось получить словарь. ${ozonMessage(e)}`);
      }
    }
    throw new BadRequestException(`Атрибута ${attributeId} нет в категориях из настройки`);
  }
}
