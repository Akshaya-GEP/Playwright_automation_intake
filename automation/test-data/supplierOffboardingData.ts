import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export type SupplierOffboardingRow = {
  sno: string;
  query: string;
  supplierName?: string;
  supplierCode?: string;
  offboardReason?: string;
};

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // Escaped quote inside a quoted field: ""
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCsvRecords(csv: string): Array<Record<string, string>> {
  const lines = csv
    .split(/\r?\n/g)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  const records: Array<Record<string, string>> = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const rec: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      rec[headers[i]] = cols[i] ?? '';
    }
    records.push(rec);
  }
  return records;
}

function normalizeHeader(s: string): string {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function pick(record: Record<string, unknown>, ...candidates: string[]): string | undefined {
  const normalized = new Map<string, string>();
  for (const k of Object.keys(record)) normalized.set(normalizeHeader(k), k);
  for (const candidate of candidates) {
    const key = normalized.get(normalizeHeader(candidate));
    if (!key) continue;
    const raw = record[key];
    const v = String(raw ?? '').trim();
    if (v) return v;
  }
  return undefined;
}

let cachedRows: SupplierOffboardingRow[] | null = null;

export function loadSupplierOffboardingRows(): SupplierOffboardingRow[] {
  if (cachedRows) return cachedRows;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const csvPath = path.join(__dirname, 'supplierOffboarding.csv');

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Supplier offboarding CSV not found at: ${csvPath}`);
  }

  const csv = fs.readFileSync(csvPath, 'utf-8');
  const records = parseCsvRecords(csv) as Array<Record<string, unknown>>;

  cachedRows = records.map((r) => {
    const sno =
      pick(r, 'SNO', 'SNO(agent no)', 'SNO (agent no)', 'SNO(agentno)', 'SNOAGENTNO') || '';
    const query = pick(r, 'QUERY') || '';

    return {
      sno,
      query,
      supplierName: pick(r, 'SUPPLIER NAME', 'SUPPLIER_NAME', 'SUPPLIERNAME'),
      supplierCode: pick(r, 'SUPPLIER CODE', 'SUPPLIER_CODE', 'SUPPLIERCODE'),
      offboardReason: pick(r, 'OFFBOARDREASON', 'OFFBOARD REASON', 'OFFBOARD_REASON'),
    };
  });

  return cachedRows;
}

export function getSupplierOffboardingRow(sno: string): SupplierOffboardingRow {
  const wanted = String(sno || '').trim();
  const rows = loadSupplierOffboardingRows();
  const row = rows.find((r) => String(r.sno || '').trim() === wanted);
  if (!row) {
    const available = rows.map((r) => r.sno).filter(Boolean).join(', ') || '(none)';
    throw new Error(`No supplier offboarding data found for SNO="${wanted}". Available SNOs: ${available}`);
  }
  if (!row.query?.trim()) {
    throw new Error(`Supplier offboarding data for SNO="${wanted}" is missing QUERY`);
  }
  return row;
}


