import * as fs from 'fs';
import * as path from 'path';

export interface IndexedFile {
  path: string;       // relative to repoDir
  category: string;
}

export interface FileIndex {
  createdAt: string;
  repoDir: string;
  files: IndexedFile[];
}

interface CategoryRule {
  pattern: RegExp;
  category: string;
  priority: number;
}

const CATEGORY_RULES: CategoryRule[] = [
  // ORM models
  { pattern: /\/models\.py$/, category: 'ORM Models', priority: 1 },
  { pattern: /\/models\/[^/]+\.py$/, category: 'ORM Models', priority: 1 },
  { pattern: /\/schema\.prisma$/, category: 'ORM Models', priority: 1 },
  { pattern: /\/schema\.rb$/, category: 'ORM Models', priority: 1 },
  { pattern: /\/entities\/[^/]+\.ts$/, category: 'ORM Models', priority: 1 },
  { pattern: /\/models\/[^/]+\.ts$/, category: 'ORM Models', priority: 1 },

  // Migrations
  { pattern: /\/migrations\/[^/]+\.(py|rb|ts|js|sql)$/, category: 'Migrations', priority: 2 },
  { pattern: /\/versions\/[^/]+\.py$/, category: 'Migrations', priority: 2 },
  { pattern: /\/db\/migrate\/[^/]+\.(rb)$/, category: 'Migrations', priority: 2 },

  // SQL / Schema
  { pattern: /\/db\/schema\.rb$/, category: 'Schema', priority: 3 },
  { pattern: /[^/]+\.sql$/, category: 'Schema', priority: 3 },

  // API schemas
  { pattern: /\.(graphql|gql)$/, category: 'GraphQL', priority: 4 },
  { pattern: /\/(openapi|swagger)\.(ya?ml|json)$/, category: 'API Schema', priority: 4 },
];

const SKIP_PATTERNS = [
  /\/node_modules\//,
  /\/\.git\//,
  /\/dist\//,
  /\/build\//,
  /\/vendor\//,
  /\.min\.(js|css)$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /\.(png|jpg|jpeg|gif|svg|ico|woff|ttf|eot|pdf|zip|tar|gz)$/i,
];

function getCategory(filePath: string): { category: string; priority: number } | null {
  const normalized = filePath.replace(/\\/g, '/');
  for (const skip of SKIP_PATTERNS) {
    if (skip.test(normalized)) return null;
  }
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(normalized)) {
      return { category: rule.category, priority: rule.priority };
    }
  }
  return null;
}

function walkDir(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

const INDEX_FILE = '.bq-write/files.json';

export function buildFileIndex(repoDir: string): FileIndex {
  const allFiles = walkDir(repoDir);

  const indexed: Array<IndexedFile & { priority: number }> = [];
  for (const absPath of allFiles) {
    const relPath = path.relative(repoDir, absPath).replace(/\\/g, '/');
    const match = getCategory('/' + relPath);
    if (match) {
      indexed.push({ path: relPath, category: match.category, priority: match.priority });
    }
  }

  indexed.sort((a, b) =>
    a.priority !== b.priority ? a.priority - b.priority : a.path.localeCompare(b.path)
  );

  return {
    createdAt: new Date().toISOString(),
    repoDir,
    files: indexed.map(({ path, category }) => ({ path, category })),
  };
}

export function saveFileIndex(repoDir: string, index: FileIndex): void {
  const indexPath = path.join(repoDir, INDEX_FILE);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
}

export function loadFileIndex(repoDir: string): FileIndex | null {
  const indexPath = path.join(repoDir, INDEX_FILE);
  if (!fs.existsSync(indexPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as FileIndex;
  } catch {
    return null;
  }
}

export function formatIndexForPrompt(index: FileIndex): string {
  if (index.files.length === 0) return '_No schema files found._';

  // Group by category
  const grouped = new Map<string, string[]>();
  for (const file of index.files) {
    const list = grouped.get(file.category) ?? [];
    list.push(file.path);
    grouped.set(file.category, list);
  }

  const lines: string[] = [];
  for (const [category, files] of grouped) {
    lines.push(`**${category}:**`);
    for (const f of files) lines.push(`  - ${f}`);
  }
  return lines.join('\n');
}
