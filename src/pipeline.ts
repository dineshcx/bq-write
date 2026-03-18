import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { Config } from './config';
import { parseDatasetRef, DatasetRef } from './bigquery/client';
import { loadContext } from './local/cache';
import { runAgentTurn, AgentOptions } from './claude/agent';

function buildSystemPrompt(ref: DatasetRef, codeContext: string): string {
  const fqPrefix = `${ref.projectId}.${ref.datasetId}`;
  return `You are a BigQuery SQL expert. Your job is to translate natural-language questions into accurate BigQuery SQL queries and execute them.

## Dataset
Target dataset: \`${fqPrefix}\`

## Rules
- Always use fully-qualified table references: \`${fqPrefix}.table_name\`
- Never use \`SELECT *\`. Always name columns explicitly.
- Add \`LIMIT 1000\` for exploratory queries unless the user asks for all rows.
- Use the source code context below to understand column semantics, enum values, and table relationships — but rely on the live BigQuery schema (via list_tables / get_table_schema) for actual column names and types.
- If a question is ambiguous, use ask_clarification before generating SQL.
- After running a query, briefly summarize the results in plain English.

## Workflow
1. Call \`list_tables\` to see what's available.
2. If needed, call \`get_table_schema\` for a specific table.
3. Generate and execute SQL with \`run_query\`.
4. Summarize the results.

## Source Code Context
${codeContext || '_No context found. Run `bq-write init` in your project directory first._'}
`;
}

export interface Pipeline {
  datasetRef: DatasetRef;
  agentOptions: AgentOptions;
  conversationHistory: Anthropic.MessageParam[];
}

export function initPipeline(dataset: string, repoDir: string, config: Config): Pipeline {
  const datasetRef = parseDatasetRef(dataset);
  const codeContext = loadContext(repoDir) ?? '';

  if (!codeContext) {
    console.log(chalk.yellow('Warning: No context found. Run `bq-write init` in your project directory for better results.\n'));
  } else {
    const tokens = Math.ceil(codeContext.length / 4);
    console.log(chalk.dim(`Loaded context (${tokens.toLocaleString()} tokens)\n`));
  }

  const agentOptions: AgentOptions = {
    apiKey: config.anthropicApiKey,
    datasetRef,
    maxResults: config.bqMaxResults,
    systemPrompt: buildSystemPrompt(datasetRef, codeContext),
  };

  return { datasetRef, agentOptions, conversationHistory: [] };
}

export async function askQuestion(pipeline: Pipeline, question: string): Promise<string> {
  pipeline.conversationHistory.push({ role: 'user', content: question });

  console.log(chalk.dim('Thinking...\n'));

  const result = await runAgentTurn(pipeline.conversationHistory, pipeline.agentOptions);

  if (result.finalText) {
    console.log(chalk.green('\n' + result.finalText));
  }

  // The agent loop already appended messages; avoid double-push
  const last = pipeline.conversationHistory[pipeline.conversationHistory.length - 1];
  if (last?.role !== 'assistant') {
    pipeline.conversationHistory.push({ role: 'assistant', content: result.finalText });
  }

  return result.finalText;
}
