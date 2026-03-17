/**
 * One-time script to discover Ozon category and attribute IDs.
 *
 * Usage:
 *   OZON_API_KEY=... OZON_CLIENT_ID=... npx ts-node apps/backend/scripts/ozon-discover-ids.ts
 *
 * Or it will read from apps/backend/.env automatically.
 */

import * as fs from 'fs';
import * as path from 'path';

const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const API_KEY = process.env.OZON_API_KEY;
const CLIENT_ID = process.env.OZON_CLIENT_ID;

if (!API_KEY || !CLIENT_ID) {
  console.error('Missing OZON_API_KEY or OZON_CLIENT_ID');
  process.exit(1);
}

const BASE_URL = 'https://api-seller.ozon.ru';

async function ozonPost(endpoint: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Client-Id': CLIENT_ID!,
      'Api-Key': API_KEY!,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ozon API ${endpoint} returned ${res.status}: ${text}`);
  }

  return res.json();
}

interface CategoryNode {
  description_category_id: number;
  category_name: string;
  children?: CategoryNode[];
  type_id?: number;
  type_name?: string;
}

function findCategory(
  nodes: CategoryNode[],
  targetName: string,
): CategoryNode | null {
  for (const node of nodes) {
    if (node.category_name?.toLowerCase().includes(targetName.toLowerCase())) {
      return node;
    }
    if (node.children) {
      const found = findCategory(node.children, targetName);
      if (found) return found;
    }
  }
  return null;
}

async function main() {
  console.log('=== Ozon Category & Attribute ID Discovery ===\n');

  // Step 1: Get category tree
  console.log('1. Fetching category tree...');
  const treeResponse = await ozonPost('/v1/description-category/tree', {
    language: 'DEFAULT',
  });

  const booksCategory = findCategory(treeResponse.result, 'Букинистические');

  if (!booksCategory) {
    console.error('Could not find "Букинистические издания" category');
    return;
  }

  console.log(`Found category: "${booksCategory.category_name}" (ID: ${booksCategory.description_category_id})`);

  // If this category has children with type_id, we need one of those
  let categoryId = booksCategory.description_category_id;
  let typeId = booksCategory.type_id;

  if (!typeId && booksCategory.children && booksCategory.children.length > 0) {
    console.log('\nCategory has children (types):');
    for (const child of booksCategory.children) {
      console.log(`  - "${child.category_name}" (category_id: ${child.description_category_id}, type_id: ${child.type_id || 'N/A'})`);
    }
    // Pick "Печатная книга" or first child with type_id
    const printedBook = booksCategory.children.find(
      (c) => c.category_name?.toLowerCase().includes('печатная') || c.type_name?.toLowerCase().includes('печатная'),
    );
    const target = printedBook || booksCategory.children.find((c) => c.type_id);
    if (target) {
      categoryId = target.description_category_id || categoryId;
      typeId = target.type_id;
      console.log(`\nUsing: "${target.category_name || target.type_name}" (category_id: ${categoryId}, type_id: ${typeId})`);
    }
  }
  console.log(`Found category: "${booksCategory.category_name}"`);
  console.log(`  description_category_id = ${categoryId}`);
  console.log(`  type_id = ${typeId || 'N/A'}`);

  // Step 2: Get attributes for this category
  console.log('\n2. Fetching attributes...');
  const attrResponse = await ozonPost('/v1/description-category/attribute', {
    description_category_id: categoryId,
    language: 'DEFAULT',
    type_id: typeId || 0,
  });

  console.log('\n=== ATTRIBUTES ===\n');

  const attributes = attrResponse.result || [];
  for (const attr of attributes) {
    const required = attr.is_required ? '[REQUIRED]' : '[optional]';
    console.log(
      `ID: ${attr.id} | ${required} | "${attr.name}" (type: ${attr.type})`,
    );
    if (attr.description) {
      console.log(`  Description: ${attr.description}`);
    }
    if (attr.dictionary_id) {
      console.log(`  Dictionary ID: ${attr.dictionary_id}`);
    }
  }

  // Step 3: Print summary for constants file
  console.log('\n=== COPY TO ozon.constants.ts ===\n');
  console.log(`export const OZON_DESCRIPTION_CATEGORY_ID = ${categoryId};`);
  if (typeId) {
    console.log(`export const OZON_TYPE_ID = ${typeId};`);
  }
  console.log('\n// Attribute IDs (update with actual values from above):');

  const knownAttrs = [
    'Автор',
    'ISBN',
    'Издательство',
    'Год выпуска',
    'Тип бумаги',
    'Тип обложки',
    'Количество страниц',
    'Язык издания',
    'Состояние',
    'Аннотация',
    'Название',
    'Направление',
    'Тип книги',
  ];

  for (const name of knownAttrs) {
    const found = attributes.find(
      (a: { name: string }) => a.name.toLowerCase() === name.toLowerCase(),
    );
    const constName = `OZON_ATTR_${name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-ZА-Я0-9_]/g, '')}`;
    if (found) {
      console.log(`export const ${constName} = ${found.id};`);
    } else {
      console.log(`// export const ${constName} = ???; // "${name}" not found`);
    }
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
