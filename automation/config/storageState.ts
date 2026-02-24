import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Keep it inside `automation/` so it stays grouped with automation artifacts.
export const AUTH_DIR = path.join(__dirname, '..', '.auth');
export const STORAGE_STATE = path.join(AUTH_DIR, 'user.json');

/**
 * Ensure `.auth` directory and an empty storage state file exist.
 * This prevents "file not found" errors before auth/setup runs.
 */
export function ensureStorageStateFileExists() {
  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    if (!fs.existsSync(STORAGE_STATE)) {
      fs.writeFileSync(STORAGE_STATE, JSON.stringify({ cookies: [], origins: [] }), 'utf-8');
    }
  } catch {
    // Ignore errors; setup hooks will attempt to create the file again.
  }
}


