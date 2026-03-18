import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = '.bq-write';
const DATASETS_FILE = 'datasets.json';

interface DatasetsCache {
  recent: string[];
}

function getCachePath(repoDir: string): string {
  return path.join(repoDir, CACHE_DIR, DATASETS_FILE);
}

export function loadRecentDatasets(repoDir: string): string[] {
  const cachePath = getCachePath(repoDir);
  if (!fs.existsSync(cachePath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as DatasetsCache;
    return data.recent ?? [];
  } catch {
    return [];
  }
}

export function saveDataset(repoDir: string, dataset: string): void {
  const cacheDir = path.join(repoDir, CACHE_DIR);
  fs.mkdirSync(cacheDir, { recursive: true });

  const existing = loadRecentDatasets(repoDir);
  const updated = [dataset, ...existing.filter((d) => d !== dataset)].slice(0, 5);
  fs.writeFileSync(getCachePath(repoDir), JSON.stringify({ recent: updated }, null, 2), 'utf-8');
}
