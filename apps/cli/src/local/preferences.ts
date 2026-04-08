import * as fs from 'fs';
import * as path from 'path';
import { getCacheDir } from './cacheDir';

interface Preferences {
  lastModel?: string;
  scanDir?: string;   // relative path within repo (for monorepos)
}

function getPrefsPath(repoDir: string): string {
  return path.join(getCacheDir(repoDir), 'preferences.json');
}

function load(repoDir: string): Preferences {
  const p = getPrefsPath(repoDir);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')) as Preferences; } catch { return {}; }
}

export function getLastModel(repoDir: string): string | undefined {
  return load(repoDir).lastModel;
}

export function saveLastModel(repoDir: string, model: string): void {
  const p = getPrefsPath(repoDir);
  fs.writeFileSync(p, JSON.stringify({ ...load(repoDir), lastModel: model }, null, 2), 'utf-8');
}

export function getScanDir(repoDir: string): string | undefined {
  return load(repoDir).scanDir;
}

export function saveScanDir(repoDir: string, scanDir: string): void {
  const p = getPrefsPath(repoDir);
  fs.writeFileSync(p, JSON.stringify({ ...load(repoDir), scanDir }, null, 2), 'utf-8');
}
