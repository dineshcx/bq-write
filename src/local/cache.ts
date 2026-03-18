import * as fs from 'fs';
import * as path from 'path';

const CACHE_DIR = '.bq-write';
const CACHE_FILE = 'context.md';
const META_FILE = 'meta.json';

interface CacheMeta {
  createdAt: string;
  tokenCount: number;
  fileCount: number;
}

function getCacheDir(repoDir: string): string {
  return path.join(repoDir, CACHE_DIR);
}

export function saveContext(repoDir: string, context: string, fileCount: number): void {
  const cacheDir = getCacheDir(repoDir);
  fs.mkdirSync(cacheDir, { recursive: true });

  fs.writeFileSync(path.join(cacheDir, CACHE_FILE), context, 'utf-8');

  const meta: CacheMeta = {
    createdAt: new Date().toISOString(),
    tokenCount: Math.ceil(context.length / 4),
    fileCount,
  };
  fs.writeFileSync(path.join(cacheDir, META_FILE), JSON.stringify(meta, null, 2), 'utf-8');
}

export function loadContext(repoDir: string): string | null {
  const contextPath = path.join(getCacheDir(repoDir), CACHE_FILE);
  if (!fs.existsSync(contextPath)) return null;
  return fs.readFileSync(contextPath, 'utf-8');
}

export function loadMeta(repoDir: string): CacheMeta | null {
  const metaPath = path.join(getCacheDir(repoDir), META_FILE);
  if (!fs.existsSync(metaPath)) return null;
  return JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as CacheMeta;
}

export function cacheExists(repoDir: string): boolean {
  return fs.existsSync(path.join(getCacheDir(repoDir), CACHE_FILE));
}
