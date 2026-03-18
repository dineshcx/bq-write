import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { input as inp } from '@inquirer/prompts';
import ora from 'ora';
import { LLMProvider, LLMMessage, ContentBlock, ToolDefinition } from '../llm/types';
import { DatasetRef } from '../bigquery/client';
import { listTables, getTableSchema, runQuery, QueryResult } from '../bigquery/executor';
import { isCredentialError, printCredentialHelp } from '../bigquery/auth';
import { displayQueryResult } from '../utils/display';

export interface AgentOptions {
  provider: LLMProvider;
  datasetRef: DatasetRef;
  maxResults: number;
  systemPrompt: string;
  repoDir: string;
}

export interface AgentResult {
  finalText: string;
  queryResult?: QueryResult;
}

const MAX_ITERATIONS = 15;

const TOOLS: ToolDefinition[] = [
  {
    name: 'list_directory',
    description: 'List files and subdirectories at a given path within the project repo.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path to list (e.g. "." or "app/models").' },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a source file from the project repo to understand column semantics, enums, and relationships.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative file path (e.g. "app/models/user.rb").' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_tables',
    description: 'List all table names in the BigQuery dataset. Use get_table_schema to fetch columns for a specific table.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_table_schema',
    description: 'Get the detailed schema for a specific BigQuery table.',
    parameters: {
      type: 'object',
      properties: {
        table_id: { type: 'string', description: 'Table name within the dataset.' },
      },
      required: ['table_id'],
    },
  },
  {
    name: 'run_query',
    description: 'Execute a BigQuery SQL query and return results. Use fully-qualified table refs. No SELECT *. Add LIMIT 1000 for exploratory queries.',
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'The BigQuery SQL to execute.' },
      },
      required: ['sql'],
    },
  },
  {
    name: 'ask_clarification',
    description: 'Ask the user a clarifying question when the request is ambiguous.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask.' },
      },
      required: ['question'],
    },
  },
];

function resolveSafe(repoDir: string, relativePath: string): string {
  const resolved = path.resolve(repoDir, relativePath);
  if (!resolved.startsWith(path.resolve(repoDir))) {
    throw new Error(`Access denied: "${relativePath}" is outside the project directory.`);
  }
  return resolved;
}

export async function runAgentTurn(
  messages: LLMMessage[],
  options: AgentOptions
): Promise<AgentResult> {
  let iterationCount = 0;
  let lastQueryResult: QueryResult | undefined;
  const spinner = ora({ color: 'gray' });

  const localMessages: LLMMessage[] = [...messages];

  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;

    const response = await options.provider.chat(localMessages, TOOLS, options.systemPrompt);

    // Build the assistant content blocks to store in history
    const assistantContent: ContentBlock[] = [];
    if (response.text) {
      assistantContent.push({ type: 'text', text: response.text });
    }
    for (const tc of response.toolCalls) {
      assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }

    localMessages.push({ role: 'assistant', content: assistantContent });

    if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
      messages.push(...localMessages.slice(messages.length));
      return { finalText: response.text, queryResult: lastQueryResult };
    }

    // Dispatch tool calls
    const toolResultBlocks: ContentBlock[] = [];

    for (const toolCall of response.toolCalls) {
      const input = toolCall.input;
      let resultContent: string;

      try {
        switch (toolCall.name) {
          case 'list_directory': {
            const relPath = (input['path'] as string) || '.';
            const absPath = resolveSafe(options.repoDir, relPath);
            console.log(chalk.dim(`  → ls ${relPath}`));
            const entries = fs.readdirSync(absPath, { withFileTypes: true });
            resultContent = entries.map((e) => e.isDirectory() ? `${e.name}/` : e.name).join('\n');
            break;
          }

          case 'read_file': {
            const relPath = input['path'] as string;
            const absPath = resolveSafe(options.repoDir, relPath);
            console.log(chalk.dim(`  → read ${relPath}`));
            if (!fs.existsSync(absPath)) {
              resultContent = `File not found: ${relPath}`;
              break;
            }
            const stat = fs.statSync(absPath);
            if (stat.size > 200_000) {
              resultContent = `File too large (${Math.round(stat.size / 1024)}KB).`;
              break;
            }
            resultContent = fs.readFileSync(absPath, 'utf-8');
            break;
          }

          case 'list_tables': {
            spinner.start(chalk.dim('Fetching table list...'));
            const tables = await listTables(options.datasetRef);
            spinner.stopAndPersist({ symbol: chalk.dim('→'), text: chalk.dim(`Found ${tables.length} tables`) });
            resultContent = JSON.stringify(tables, null, 2);
            break;
          }

          case 'get_table_schema': {
            const tableId = input['table_id'] as string;
            spinner.start(chalk.dim(`Fetching schema: ${tableId}`));
            const schema = await getTableSchema(options.datasetRef, tableId);
            spinner.stopAndPersist({ symbol: chalk.dim('→'), text: chalk.dim(`Schema: ${tableId} (${schema.columns.length} columns)`) });
            resultContent = JSON.stringify(schema, null, 2);
            break;
          }

          case 'run_query': {
            const sql = input['sql'] as string;
            console.log(chalk.dim('\n' + sql + '\n'));
            spinner.start(chalk.dim('Running query...'));
            const result = await runQuery(options.datasetRef, sql, options.maxResults);
            spinner.stopAndPersist({ symbol: chalk.dim('→'), text: chalk.dim(`Query done — ${result.totalRows} row(s)`) });
            lastQueryResult = result;
            displayQueryResult(result);
            resultContent = JSON.stringify({
              totalRows: result.totalRows,
              bytesProcessed: result.bytesProcessed,
              schema: result.schema,
              rows: result.rows.slice(0, 5),
            }, null, 2);
            break;
          }

          case 'ask_clarification': {
            const question = input['question'] as string;
            console.log('');
            resultContent = await inp({ message: chalk.yellow(question) });
            break;
          }

          default:
            resultContent = `Unknown tool: ${toolCall.name}`;
        }
      } catch (err) {
        if (isCredentialError(err)) {
          printCredentialHelp();
          // Abort the whole turn — no point continuing without BQ access
          messages.push(...localMessages.slice(messages.length));
          return { finalText: '', queryResult: lastQueryResult };
        }
        resultContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
        console.error(chalk.red(`  [${toolCall.name}] ${resultContent}`));
      }

      toolResultBlocks.push({ type: 'tool_result', tool_use_id: toolCall.id, content: resultContent });
    }

    localMessages.push({ role: 'user', content: toolResultBlocks });
  }

  messages.push(...localMessages.slice(messages.length));
  return {
    finalText: 'Maximum iterations reached. Please try a more specific question.',
    queryResult: lastQueryResult,
  };
}

