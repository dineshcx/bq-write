import { LLMMessage } from './llm/types';
import { LLMProvider } from './llm/types';
import chalk from 'chalk';
import { parseDatasetRef, DatasetRef } from './bigquery/client';
import { runAgentTurn, AgentOptions } from './claude/agent';
import { FileIndex, formatIndexForPrompt } from './local/indexer';
import { Config } from './config';

function buildSystemPrompt(ref: DatasetRef, repoDir: string, fileIndex: FileIndex | null): string {
  const fqPrefix = `${ref.projectId}.${ref.datasetId}`;

  const fileMapSection = fileIndex
    ? `## Schema files in this project\nThe following files were found in \`${repoDir}\`. Use \`read_file\` to read the ones relevant to the question — no need to explore with \`list_directory\`.\n\n${formatIndexForPrompt(fileIndex)}`
    : `## Project directory\nSource code is at \`${repoDir}\`. Use \`list_directory\` to explore and \`read_file\` to read relevant files.`;

  return `You are a BigQuery SQL expert. Translate natural-language questions into accurate BigQuery SQL and execute them.

## Dataset
Target dataset: \`${fqPrefix}\`

${fileMapSection}

## Workflow
1. Read the source files relevant to the question to understand column semantics, enum values, and relationships.
2. Call \`list_tables\` to confirm the live BigQuery schema.
3. Write and execute SQL with \`run_query\`.
4. Summarize the results in plain English.

## SQL rules
- Always use fully-qualified table references: \`${fqPrefix}.table_name\`
- Never use \`SELECT *\`. Name columns explicitly.
- Add \`LIMIT 1000\` for exploratory queries unless the user asks for all rows.
- If the question is ambiguous, use \`ask_clarification\` first.
`;
}

export interface Pipeline {
  datasetRef: DatasetRef;
  agentOptions: AgentOptions;
  conversationHistory: LLMMessage[];
}

export function initPipeline(
  dataset: string,
  repoDir: string,
  config: Config,
  fileIndex: FileIndex | null,
  provider: LLMProvider
): Pipeline {
  const datasetRef = parseDatasetRef(dataset);

  const agentOptions: AgentOptions = {
    provider,
    datasetRef,
    maxResults: config.bqMaxResults,
    systemPrompt: buildSystemPrompt(datasetRef, repoDir, fileIndex),
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
