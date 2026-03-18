import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface Config {
  anthropicApiKey: string;
  bqMaxResults: number;
  contextMaxTokens: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
      `Add it to your shell profile (~/.zshrc or ~/.bashrc):\n` +
      `  export ${name}=<your-value>\nThen run: source ~/.zshrc`
    );
  }
  return value;
}

export function loadConfig(): Config {
  return {
    anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
    bqMaxResults: parseInt(process.env['BQ_MAX_RESULTS'] ?? '100', 10),
    contextMaxTokens: parseInt(process.env['CONTEXT_MAX_TOKENS'] ?? '80000', 10),
  };
}
