import * as fs from 'fs';
import * as path from 'path';
import { approximateTokens } from '../utils/tokenizer';

interface PriorityRule {
  pattern: RegExp;
  priority: number;
}

const PRIORITY_RULES: PriorityRule[] = [
  // Tier 1 — ORM model files
  { pattern: /\/models\.py$/, priority: 1 },
  { pattern: /\/schema\.prisma$/, priority: 1 },
  { pattern: /\/schema\.rb$/, priority: 1 },
  { pattern: /\/models\/[^/]+\.py$/, priority: 1 },

  // Tier 2 — migrations & TypeORM entities
  { pattern: /\/migrations\/[^/]+\.(py|rb|ts|js|sql)$/, priority: 2 },
  { pattern: /\/entities\/[^/]+\.ts$/, priority: 2 },
  { pattern: /\/models\/[^/]+\.ts$/, priority: 2 },

  // Tier 3 — SQL DDL, Alembic versions
  { pattern: /\/versions\/[^/]+\.py$/, priority: 3 },
  { pattern: /\.(sql)$/, priority: 3 },
  { pattern: /\/db\/schema\.rb$/, priority: 3 },

  // Tier 4 — GraphQL / OpenAPI schemas
  { pattern: /\.(graphql|gql)$/, priority: 4 },
  { pattern: /\/(openapi|swagger)\.(ya?ml|json)$/, priority: 4 },

  // Tier 5 — README fallback
  { pattern: /^readme\.md$/i, priority: 5 },
  { pattern: /\/readme\.md$/i, priority: 5 },
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

function getPriority(filePath: string): number | null {
  const normalized = filePath.replace(/\\/g, '/');
  for (const skip of SKIP_PATTERNS) {
    if (skip.test(normalized)) return null;
  }
  for (const rule of PRIORITY_RULES) {
    if (rule.pattern.test(normalized)) return rule.priority;
  }
  return null;
}

function walkDir(dir: string): Array<{ path: string; size: number }> {
  const results: Array<{ path: string; size: number }> = [];
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
      try {
        const stat = fs.statSync(fullPath);
        results.push({ path: fullPath, size: stat.size });
      } catch {
        // skip unreadable files
      }
    }
  }
  return results;
}

function extToLang(ext: string): string {
  const map: Record<string, string> = {
    py: 'python', rb: 'ruby', ts: 'typescript', js: 'javascript',
    sql: 'sql', prisma: 'prisma', graphql: 'graphql', gql: 'graphql',
    yaml: 'yaml', yml: 'yaml', json: 'json', md: 'markdown',
  };
  return map[ext] ?? ext;
}

export function scanLocalRepo(repoDir: string, maxTokens: number): string {
  const allFiles = walkDir(repoDir);

  const ranked = allFiles
    .map((f) => ({ ...f, priority: getPriority(f.path) }))
    .filter((f) => f.priority !== null)
    .sort((a, b) => {
      if (a.priority !== b.priority) return (a.priority as number) - (b.priority as number);
      return a.path.length - b.path.length;
    }) as Array<{ path: string; size: number; priority: number }>;

  const sections: string[] = [];
  let budget = maxTokens;

  for (const file of ranked) {
    if (budget <= 0) break;
    if (file.size > 200_000) continue;

    let content: string;
    try {
      content = fs.readFileSync(file.path, 'utf-8');
    } catch {
      continue;
    }

    const tokens = approximateTokens(content);
    if (tokens > budget) continue;

    const relPath = path.relative(repoDir, file.path);
    const ext = file.path.split('.').pop() ?? '';
    sections.push(`### ${relPath}\n\`\`\`${extToLang(ext)}\n${content}\n\`\`\``);
    budget -= tokens;
  }

  return sections.join('\n\n');
}
