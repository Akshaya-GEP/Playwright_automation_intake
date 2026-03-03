import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ContractTerminationRow {
    sno: string;
    query: string;
    terminationStatus: string;
    terminationDate: string;
    reasonTerminate: string;
}

export function getContractTerminationRows(): ContractTerminationRow[] {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const csvPath = path.join(__dirname, 'Contract Termination.csv');
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim() !== '');
    const dataLines = lines.slice(1); // skip header

    return dataLines.map(line => {
        const [sno, query, terminationStatus, terminationDate, reasonTerminate] = line.split(',').map(s => s.trim());
        return {
            sno,
            query,
            terminationStatus,
            terminationDate,
            reasonTerminate
        };
    });
}

export function getContractTerminationRow(sno: string): ContractTerminationRow {
    const rows = getContractTerminationRows();
    const row = rows.find(r => r.sno === sno);
    if (!row) {
        throw new Error(`Contract Termination data not found for sno: ${sno}`);
    }
    return row;
}
