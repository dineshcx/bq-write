import * as path from 'path';
import { LLMMessage, LLMProvider } from './llm/types';
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

## Workflow — follow this order strictly
1. **Read the entity file.** Use the file map to find the relevant entity/model file. Read it carefully — the table name, column names, types, and especially **enum values** are all there. This is your primary source of truth.
2. **Follow imports for enums — this is mandatory.** After reading an entity file, scan its import statements. For any column that filters by a status, type, role, or state value, find the import that defines that type and call \`read_file\` on it before writing SQL. Example: entity has \`status: ConversationStatus\` imported from \`'../enums/conversation-status.enum'\` — read that file first to get the exact string (e.g. \`'completed'\` not \`'Completed'\`). Wrong values silently return 0 rows.
3. **Write and run the query immediately.** Use what you learned from the entity to write SQL and call \`run_query\`. Do NOT call \`list_tables\` or \`get_table_schema\` first — the entity already has this information.
4. **Summarize** the results in plain English.

## When to use BQ tools
- \`list_tables\` — only if you have no entity files and need to discover what tables exist
- \`get_table_schema\` — only if the entity file is missing a column or you need to verify a type mismatch
- These are fallback tools, not part of the normal flow.

## SQL rules
- Always use fully-qualified table references: \`${fqPrefix}.table_name\`
- Never use \`SELECT *\`. Name columns explicitly.
- Add \`LIMIT 1000\` for exploratory queries unless the user asks for all rows.
- If the question is truly ambiguous (not just word choice), use \`ask_clarification\` first.

## TypeORM naming conventions
The project uses TypeORM. Both table names and column names follow snake_case in BigQuery — never use the camelCase or PascalCase names from the entity file directly in SQL.

- Entity class → table: \`Contributor\` → \`contributor\`, \`TaskAssignment\` → \`task_assignment\`
- Entity property → column: \`projectId\` → \`project_id\`, \`createdAt\` → \`created_at\`, \`isActive\` → \`is_active\`

Rule: convert every PascalCase class name and every camelCase property name to lowercase snake_case before using in SQL.
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
  scanDir: string,
  config: Config,
  fileIndex: FileIndex | null,
  provider: LLMProvider
): Pipeline {
  const datasetRef = parseDatasetRef(dataset);
  // Agent file ops are scoped to the selected app dir (or full repo if no scanDir)
  const agentRoot = scanDir ? path.join(repoDir, scanDir) : repoDir;

  const agentOptions: AgentOptions = {
    provider,
    datasetRef,
    maxResults: config.bqMaxResults,
    systemPrompt: buildSystemPrompt(datasetRef, agentRoot, fileIndex),
    repoDir: agentRoot,
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
