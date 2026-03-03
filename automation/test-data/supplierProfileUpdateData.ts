import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface SupplierProfileUpdateRow {
    sno: string;
    query: string;
    supplierName: string;
    supplierCode: string;
    updateOption: string;       // kept for back-compat
    updateType: string;         // alias used by new agent5.ts
    modificationDetails: string;
    reasonAction: string;       // alias used by new agent5.ts
    attachmentPath: string;
    uploadFile: string;         // alias used by new agent5.ts
}

export function getSupplierProfileUpdateRows(): SupplierProfileUpdateRow[] {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const csvPath = path.join(__dirname, 'Supplier Profile Update.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim().toUpperCase());
  const dataLines = lines.slice(1); // skip header

  return dataLines.map(line => {
    const cols = line.split(',').map(s => s.trim());
    const byHeader = new Map<string, string>();
    for (let i = 0; i < header.length; i++) {
      byHeader.set(header[i], cols[i] ?? '');
    }

    // Supports BOTH:
    // - legacy format: SNO,QUERY,SUPPLIER_NAME,UPDATE_OPTION,MODIFICATION_DETAILS,ATTACHMENT_PATH
    // - current format: SNO,QUERY,SUPPLIER_NAME,SUPPLIER_CODE,UPDATE_TYPE,REASON_ACTION,UPLOAD_FILE
    const sno = byHeader.get('SNO') ?? cols[0] ?? '';
    const query = byHeader.get('QUERY') ?? cols[1] ?? '';
    const supplierName = byHeader.get('SUPPLIER_NAME') ?? cols[2] ?? '';
    const supplierCode = byHeader.get('SUPPLIER_CODE') ?? '';

    const updateOption =
      byHeader.get('UPDATE_TYPE') ??
      byHeader.get('UPDATE_OPTION') ??
      cols[3] ??
      '';

    const modificationDetails =
      byHeader.get('MODIFICATION_DETAILS') ??
      '';

    const reasonAction =
      byHeader.get('REASON_ACTION') ??
      byHeader.get('MODIFICATION_DETAILS') ??
      cols[4] ??
      '';

    const attachmentPath =
      byHeader.get('UPLOAD_FILE') ??
      byHeader.get('ATTACHMENT_PATH') ??
      cols[5] ??
      '';

    return {
      sno,
      query,
      supplierName,
      supplierCode,
      updateOption,
      updateType: updateOption, // alias
      modificationDetails,
      reasonAction, // alias
      attachmentPath,
      uploadFile: attachmentPath // alias
    };
  });
}

export function getSupplierProfileUpdateRow(sno: string): SupplierProfileUpdateRow {
    const rows = getSupplierProfileUpdateRows();
    const row = rows.find(r => r.sno === sno);
    if (!row) {
        throw new Error(`Supplier Profile Update data not found for sno: ${sno}`);
    }
    return row;
}
