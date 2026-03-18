import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { getAnthropicClient, MODEL } from './client';
import { TOOLS } from './tools';
import { DatasetRef } from '../bigquery/client';
import { listTables, getTableSchema, runQuery, QueryResult } from '../bigquery/executor';
import { displayQueryResult } from '../utils/display';

export interface AgentOptions {
  apiKey: string;
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

function resolveSafe(repoDir: string, relativePath: string): string {
  const resolved = path.resolve(repoDir, relativePath);
  if (!resolved.startsWith(path.resolve(repoDir))) {
    throw new Error(`Access denied: "${relativePath}" is outside the project directory.`);
  }
  return resolved;
}

export async function runAgentTurn(
  messages: Anthropic.MessageParam[],
  options: AgentOptions
): Promise<AgentResult> {
  const client = getAnthropicClient(options.apiKey);
  let iterationCount = 0;
  let lastQueryResult: QueryResult | undefined;

  const localMessages = [...messages];

  while (iterationCount < MAX_ITERATIONS) {
    iterationCount++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: options.systemPrompt,
      tools: TOOLS,
      messages: localMessages,
    });

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
    );

    localMessages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn' || toolUseBlocks.length === 0) {
      const finalText = textBlocks.map((b) => b.text).join('\n');
      messages.push(...localMessages.slice(messages.length));
      return { finalText, queryResult: lastQueryResult };
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const input = toolUse.input as Record<string, unknown>;
      let resultContent: string;

      try {
        switch (toolUse.name) {
          case 'list_directory': {
            const relPath = (input['path'] as string) || '.';
            const absPath = resolveSafe(options.repoDir, relPath);
            console.log(chalk.dim(`  → ls ${relPath}`));
            const entries = fs.readdirSync(absPath, { withFileTypes: true });
            const listing = entries.map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
            resultContent = listing.join('\n');
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
              resultContent = `File too large to read (${Math.round(stat.size / 1024)}KB). Try a more specific file.`;
              break;
            }
            resultContent = fs.readFileSync(absPath, 'utf-8');
            break;
          }

          case 'list_tables': {
            console.log(chalk.dim('  → Listing BQ tables...'));
            const tables = await listTables(options.datasetRef);
            resultContent = JSON.stringify(tables, null, 2);
            break;
          }

          case 'get_table_schema': {
            const tableId = input['table_id'] as string;
            console.log(chalk.dim(`  → BQ schema: ${tableId}`));
            const schema = await getTableSchema(options.datasetRef, tableId);
            resultContent = JSON.stringify(schema, null, 2);
            break;
          }

          case 'run_query': {
            const sql = input['sql'] as string;
            console.log(chalk.dim('  → Running query...'));
            console.log(chalk.dim(`     ${sql.split('\n')[0].trim()}`));
            const result = await runQuery(options.datasetRef, sql, options.maxResults);
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
            console.log(chalk.yellow(`\n${question}`));
            const answer = await promptUser('> ');
            resultContent = answer;
            break;
          }

          default:
            resultContent = `Unknown tool: ${toolUse.name}`;
        }
      } catch (err) {
        resultContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
        console.error(chalk.red(`  [${toolUse.name}] ${resultContent}`));
      }

      toolResults.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: resultContent,
      });
    }

    localMessages.push({ role: 'user', content: toolResults });
  }

  messages.push(...localMessages.slice(messages.length));
  return {
    finalText: 'Maximum iterations reached. Please try a more specific question.',
    queryResult: lastQueryResult,
  };
}

function promptUser(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}
