import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = '.bq-write';
const PREFS_FILE = 'preferences.json';

interface Preferences {
  lastModel?: string;
  recentDatasets?: string[];
}

function getPrefsPath(repoDir: string): string {
  return path.join(repoDir, CACHE_DIR, PREFS_FILE);
}

function load(repoDir: string): Preferences {
  const p = getPrefsPath(repoDir);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as Preferences; } catch { return {}; }
}

function save(repoDir: string, prefs: Preferences): void {
  const dir = path.join(repoDir, CACHE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getPrefsPath(repoDir), JSON.stringify(prefs, null, 2), 'utf-8');
}

export function getLastModel(repoDir: string): string | undefined {
  return load(repoDir).lastModel;
}

export function saveLastModel(repoDir: string, model: string): void {
  save(repoDir, { ...load(repoDir), lastModel: model });
}
