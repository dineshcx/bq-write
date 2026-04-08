import * as fs from 'fs';
import * as path from 'path';
import { getCacheDir } from './cacheDir';

interface DatasetsCache {
  recent: string[];
}

export function loadRecentDatasets(repoDir: string): string[] {
  const p = path.join(getCacheDir(repoDir), 'datasets.json');
  if (!fs.existsSync(p)) return [];
  try {
    return (JSON.parse(fs.readFileSync(p, 'utf-8')) as DatasetsCache).recent ?? [];
  } catch {
    return [];
  }
}

export function saveDataset(repoDir: string, dataset: string): void {
  const p = path.join(getCacheDir(repoDir), 'datasets.json');
  const existing = loadRecentDatasets(repoDir);
  const updated = [dataset, ...existing.filter((d) => d !== dataset)].slice(0, 5);
  fs.writeFileSync(p, JSON.stringify({ recent: updated }, null, 2), 'utf-8');
}
