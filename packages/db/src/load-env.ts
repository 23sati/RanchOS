import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));

let loaded = false;

export function loadEnvFile() {
  if (loaded || !fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) {
      continue;
    }

    const rawValue = trimmed.slice(separatorIndex + 1);
    const commentIndex = rawValue.indexOf('#');
    const value = (commentIndex >= 0 ? rawValue.slice(0, commentIndex) : rawValue).trim();

    process.env[key] = value;
  }

  loaded = true;
}
