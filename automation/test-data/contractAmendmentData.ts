import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export type ContractAmendmentRow = {
    sno: string;
    query: string;
    reasonAmend?: string;
};

function parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
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

let cachedRows: ContractAmendmentRow[] | null = null;

export function loadContractAmendmentRows(): ContractAmendmentRow[] {
    if (cachedRows) return cachedRows;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const csvPath = path.join(__dirname, 'Contract Amendment.csv');

    if (!fs.existsSync(csvPath)) {
        throw new Error(`Contract Amendment CSV not found at: ${csvPath}`);
    }

    const csv = fs.readFileSync(csvPath, 'utf-8');
    const records = parseCsvRecords(csv) as Array<Record<string, unknown>>;

    cachedRows = records.map((r) => {
        const sno = pick(r, 'SNO') || '';
        const query = pick(r, 'QUERY') || '';
        const reasonAmend = pick(r, 'REASON_AMEND', 'REASON_AMEND_2', 'REASON AMEND');

        return {
            sno,
            query,
            reasonAmend,
        };
    });

    return cachedRows;
}

export function getContractAmendmentRow(sno: string): ContractAmendmentRow {
    const wanted = String(sno || '').trim();
    const rows = loadContractAmendmentRows();
    const row = rows.find((r) => String(r.sno || '').trim() === wanted);
    if (!row) {
        const available = rows.map((r) => r.sno).filter(Boolean).join(', ') || '(none)';
        throw new Error(`No Contract Amendment data found for SNO="${wanted}". Available SNOs: ${available}`);
    }
    if (!row.query?.trim()) {
        throw new Error(`Contract Amendment data for SNO="${wanted}" is missing QUERY`);
    }
    return row;
}
