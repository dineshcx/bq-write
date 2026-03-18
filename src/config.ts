import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface Config {
  anthropicApiKey?: string;
  openaiApiKey?: string;
  bqMaxResults: number;
  contextMaxTokens: number;
}

export function loadConfig(): Config {
  const config: Config = {
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
    openaiApiKey: process.env['OPENAI_API_KEY'],
    bqMaxResults: parseInt(process.env['BQ_MAX_RESULTS'] ?? '100', 10),
    contextMaxTokens: parseInt(process.env['CONTEXT_MAX_TOKENS'] ?? '80000', 10),
  };

  if (!config.anthropicApiKey && !config.openaiApiKey) {
    throw new Error(
      'No API key found. Set at least one in your shell profile (~/.zshrc or ~/.bashrc):\n' +
      '  export ANTHROPIC_API_KEY=sk-ant-...\n' +
      '  export OPENAI_API_KEY=sk-...'
    );
  }

  return config;
}
