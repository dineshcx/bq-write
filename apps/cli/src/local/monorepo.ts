import * as fs from 'fs';
import * as path from 'path';

const MONOREPO_SIGNALS = [
  'pnpm-workspace.yaml',
  'lerna.json',
  'nx.json',
  'rush.json',
  'turbo.json',
];

const MONOREPO_PACKAGE_DIRS = ['apps', 'packages', 'services', 'libs'];

export function isMonorepo(repoDir: string): boolean {
  for (const signal of MONOREPO_SIGNALS) {
    if (fs.existsSync(path.join(repoDir, signal))) return true;
  }
  // Has apps/ or packages/ with multiple subdirectories
  for (const dir of MONOREPO_PACKAGE_DIRS) {
    const fullDir = path.join(repoDir, dir);
    if (!fs.existsSync(fullDir)) continue;
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    if (entries.filter((e) => e.isDirectory()).length >= 2) return true;
  }
  return false;
}

export function listPackages(repoDir: string): string[] {
  const packages: string[] = [];
  for (const dir of MONOREPO_PACKAGE_DIRS) {
    const fullDir = path.join(repoDir, dir);
    if (!fs.existsSync(fullDir)) continue;
    const entries = fs.readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        packages.push(path.join(dir, entry.name));
      }
    }
  }
  return packages.sort();
}
