/**
 * Minimal CSV parser: quoted fields ("" escapes, newlines inside quotes),
 * delimiter auto-detected from the first line — Excel in the Russian locale
 * saves with ';', most other tools with ','.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [';', ',', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);

  return rows.map((r) => r.map((c) => c.trim()));
}

export interface StoreCsvRow {
  name: string;
  clientId: string;
  apiKey: string;
}

/**
 * Parses an Ozon stores CSV. Columns are matched by header when one is present
 * (name/название, client_id, api_key/ключ); without a header the order is
 * name, Client-Id, Api-Key. A missing name falls back to "Магазин <Client-Id>".
 */
export function parseStoresCsv(text: string): {
  stores: StoreCsvRow[];
  errors: string[];
} {
  const rows = parseCsv(text);
  let cols = { name: 0, clientId: 1, apiKey: 2 };
  let start = 0;

  const header = rows[0]?.map((c) => c.toLowerCase()) ?? [];
  if (header.some((c) => /client|api|key|ключ|назв|name|магазин/.test(c))) {
    const find = (re: RegExp) => header.findIndex((c) => re.test(c));
    const clientId = find(/client/);
    const apiKey = find(/api|key|ключ/);
    const name = find(/назв|name|магазин/);
    if (clientId >= 0 && apiKey >= 0) {
      cols = { name, clientId, apiKey };
      start = 1;
    }
  }

  const stores: StoreCsvRow[] = [];
  const errors: string[] = [];
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    if (r.every((c) => c === '')) continue;
    const clientId = r[cols.clientId] ?? '';
    const apiKey = r[cols.apiKey] ?? '';
    if (!clientId || !apiKey) {
      errors.push(`Строка ${i + 1}: нет Client-Id или Api-Key`);
      continue;
    }
    const name = (cols.name >= 0 ? r[cols.name] : '') || `Магазин ${clientId}`;
    stores.push({ name: name.slice(0, 100), clientId, apiKey });
  }
  return { stores, errors };
}
