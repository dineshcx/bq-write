import * as dotenv from 'dotenv';
import * as path from 'path';
import { loadGlobalConfig } from './global/config';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface Config {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  bqMaxResults: number;
  contextMaxTokens: number;
}

export function loadConfig(): Config {
  const global = loadGlobalConfig();

  // Env vars take precedence over saved config
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'] || global.anthropicApiKey;
  const openaiApiKey = process.env['OPENAI_API_KEY'] || global.openaiApiKey;

  if (!anthropicApiKey && !openaiApiKey) {
    throw new Error(
      'No API key found. Run `bq-write setup` to configure, or set an env var:\n' +
      '  export ANTHROPIC_API_KEY=sk-ant-...\n' +
      '  export OPENAI_API_KEY=sk-...'
    );
  }

  return {
    anthropicApiKey,
    openaiApiKey,
    bqMaxResults: parseInt(process.env['BQ_MAX_RESULTS'] ?? '100', 10),
    contextMaxTokens: parseInt(process.env['CONTEXT_MAX_TOKENS'] ?? '80000', 10),
  };
}
