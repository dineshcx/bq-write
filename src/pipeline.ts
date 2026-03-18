import Anthropic from '@anthropic-ai/sdk';
import chalk from 'chalk';
import { Config } from './config';
import { parseDatasetRef, DatasetRef } from './bigquery/client';
import { runAgentTurn, AgentOptions } from './claude/agent';

function buildSystemPrompt(ref: DatasetRef, repoDir: string): string {
  const fqPrefix = `${ref.projectId}.${ref.datasetId}`;
  return `You are a BigQuery SQL expert. Your job is to translate natural-language questions into accurate BigQuery SQL queries and execute them.

## Dataset
Target dataset: \`${fqPrefix}\`

## Project directory
The user's application source code is at: \`${repoDir}\`
You have access to \`list_directory\` and \`read_file\` tools to explore it.

## Workflow
1. Use \`list_directory\` and \`read_file\` to find and read the files relevant to the question — model definitions, migrations, schema files, etc. Only read what is needed.
2. Call \`list_tables\` to see the live BigQuery schema.
3. Use what you learned from the source code to understand column semantics, enum values, and relationships. Use the live BQ schema for actual column names and types.
4. Write and execute SQL with \`run_query\`.
5. Summarize the results in plain English.

## SQL rules
- Always use fully-qualified table references: \`${fqPrefix}.table_name\`
- Never use \`SELECT *\`. Name columns explicitly.
- Add \`LIMIT 1000\` for exploratory queries unless the user asks for all rows.
- If a question is ambiguous, use \`ask_clarification\` before writing SQL.
`;
}

export interface Pipeline {
  datasetRef: DatasetRef;
  agentOptions: AgentOptions;
  conversationHistory: Anthropic.MessageParam[];
}

export function initPipeline(dataset: string, repoDir: string, config: Config): Pipeline {
  const datasetRef = parseDatasetRef(dataset);

  const agentOptions: AgentOptions = {
    apiKey: config.anthropicApiKey,
    datasetRef,
    maxResults: config.bqMaxResults,
    systemPrompt: buildSystemPrompt(datasetRef, repoDir),
    repoDir,
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

  const last = pipeline.conversationHistory[pipeline.conversationHistory.length - 1];
  if (last?.role !== 'assistant') {
    pipeline.conversationHistory.push({ role: 'assistant', content: result.finalText });
  }

  return result.finalText;
}
