import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ContractExtensionRow {
    sno: string;
    query: string;
    extensionDate: string;
    reason: string;
    modifications: string;
    updateOption: string;
    currency: string;
    estimatedCost: string;
    approval: string;
    applicableOptions: string;
    modificationDetails: string;
}

export function getContractExtensionRows(): ContractExtensionRow[] {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const csvPath = path.join(__dirname, 'Contract Extension.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const dataLines = lines.slice(1); // skip header

    return dataLines.map(line => {
        const [sno, query, extensionDate, reason, modifications, updateOption, currency, estimatedCost, approval, applicableOptions, modificationDetails] = line.split(',').map(s => s.trim());
        return {
            sno,
            query,
            extensionDate,
            reason,
            modifications,
            updateOption,
            currency,
            estimatedCost,
            approval,
            applicableOptions: applicableOptions || '',
            modificationDetails: modificationDetails || ''
        };
    });
}

export function getContractExtensionRow(sno: string): ContractExtensionRow {
    const rows = getContractExtensionRows();
    const row = rows.find(r => r.sno === sno);
    if (!row) {
        throw new Error(`Contract Extension data not found for sno: ${sno}`);
    }
    return row;
}
