import * as fs from 'fs';
import * as path from 'path';
import { getCacheDir } from './cacheDir';

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
  // ── Python (Django, SQLAlchemy, FastAPI) ──────────────────────────────────
  { pattern: /\/models\.py$/, category: 'Models', priority: 1 },
  { pattern: /\/models\/[^/]+\.py$/, category: 'Models', priority: 1 },

  // ── Ruby on Rails (ActiveRecord) ─────────────────────────────────────────
  { pattern: /\/app\/models\/[^/]+\.rb$/, category: 'Models', priority: 1 },
  { pattern: /\/db\/schema\.rb$/, category: 'Models', priority: 1 },

  // ── Prisma ────────────────────────────────────────────────────────────────
  { pattern: /\/schema\.prisma$/, category: 'Models', priority: 1 },

  // ── TypeORM / NestJS ──────────────────────────────────────────────────────
  { pattern: /\/entities\/[^/]+\.ts$/, category: 'Models', priority: 1 },
  { pattern: /[^/]+\.entity\.ts$/, category: 'Models', priority: 1 },

  // ── Sequelize ─────────────────────────────────────────────────────────────
  { pattern: /\/models\/[^/]+\.(ts|js)$/, category: 'Models', priority: 1 },

  // ── Mongoose ──────────────────────────────────────────────────────────────
  { pattern: /[^/]+\.model\.(ts|js)$/, category: 'Models', priority: 1 },
  { pattern: /\/schemas\/[^/]+\.(ts|js)$/, category: 'Models', priority: 1 },

  // ── Laravel / Eloquent (PHP) ──────────────────────────────────────────────
  { pattern: /\/app\/Models\/[^/]+\.php$/, category: 'Models', priority: 1 },

  // ── Spring / Hibernate (Java) ─────────────────────────────────────────────
  { pattern: /\/entity\/[^/]+\.java$/, category: 'Models', priority: 1 },
  { pattern: /[^/]+Entity\.java$/, category: 'Models', priority: 1 },

  // ── GORM (Go) ─────────────────────────────────────────────────────────────
  { pattern: /\/models\/[^/]+\.go$/, category: 'Models', priority: 1 },

  // ── GraphQL / OpenAPI (schema = entity definitions) ──────────────────────
  { pattern: /\.(graphql|gql)$/, category: 'GraphQL', priority: 2 },
  { pattern: /\/(openapi|swagger)\.(ya?ml|json)$/, category: 'API Schema', priority: 2 },
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

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', 'coverage', '.cache', 'tmp', 'log', 'logs',
]);

function walkDir(rootDir: string): string[] {
  const results: string[] = [];
  const queue: string[] = [rootDir];

  while (queue.length > 0) {
    const dir = queue.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        results.push(path.join(dir, entry.name));
      }
    }
  }
  return results;
}

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

function getIndexPath(repoDir: string): string {
  return path.join(getCacheDir(repoDir), 'files.json');
}

export function saveFileIndex(repoDir: string, index: FileIndex): void {
  fs.writeFileSync(getIndexPath(repoDir), JSON.stringify(index, null, 2), 'utf-8');
}

export function loadFileIndex(repoDir: string): FileIndex | null {
  const p = getIndexPath(repoDir);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as FileIndex;
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
