// Web agent runner — adapted from src/agent/agent.ts
// Replaces: chalk/ora/inquirer (CLI) → structured return values
// Replaces: fs.readFileSync → Supabase Storage
// Replaces: BigQuery ADC → OAuth token via REST

import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "@/lib/supabase";
import {
  listTables,
  getTableSchema,
  runQuery,
  DatasetRef,
  QueryResult,
} from "./bq-executor";

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

export type ProgressEvent =
  | { type: "thinking" }
  | { type: "reading_file"; path: string }
  | { type: "listing_files" }
  | { type: "listing_tables" }
  | { type: "getting_schema"; table: string }
  | { type: "running_query"; sql: string }
  | { type: "query_done"; rows: number };

export interface AgentRunOptions {
  appId: string;
  datasetRef: DatasetRef;
  accessToken: string;
  systemPrompt: string;
  onProgress?: (event: ProgressEvent) => void;
}

export interface AgentRunResult {
  finalText: string;
  clarification?: string;
  queryResult?: QueryResult;
  queries: string[];
}

const MAX_ITERATIONS = 15;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_directory",
    description:
      "List entity/model files available in this app. Pass '.' for all files or a path prefix to filter.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Path prefix to filter (e.g. '.' or 'src/entities')" },
      },
      required: ["path"],
    },
  },
  {
    name: "read_file",
    description:
      "Read the contents of an entity/model file. Use this to understand column names, types, and enum values.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path as shown in list_directory." },
      },
      required: ["path"],
    },
  },
  {
    name: "list_tables",
    description: "List all table names in the selected BigQuery dataset.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "get_table_schema",
    description: "Get detailed schema for a specific BigQuery table.",
    input_schema: {
      type: "object" as const,
      properties: {
        table_id: { type: "string", description: "Table name within the dataset." },
      },
      required: ["table_id"],
    },
  },
  {
    name: "run_query",
    description:
      "Execute a BigQuery SQL query. Use fully-qualified refs (project.dataset.table). No SELECT *. LIMIT 1000 for exploratory queries.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql: { type: "string", description: "The BigQuery SQL to execute." },
      },
      required: ["sql"],
    },
  },
  {
    name: "ask_clarification",
    description: "Ask the user a clarifying question when the request is ambiguous.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "The clarifying question." },
      },
      required: ["question"],
    },
  },
];

async function listAppFiles(appId: string, pathPrefix: string): Promise<string> {
  const { data } = await supabase
    .from("app_files")
    .select("file_path, category")
    .eq("app_id", appId)
    .order("file_path");

  if (!data || data.length === 0) return "No entity files found.";

  const prefix = pathPrefix === "." ? "" : pathPrefix.replace(/\/?$/, "/");
  const filtered = prefix
    ? data.filter((f) => f.file_path.startsWith(prefix))
    : data;

  if (filtered.length === 0) return `No files found under "${pathPrefix}".`;

  return filtered
    .map((f) => `${f.file_path}${f.category ? ` [${f.category}]` : ""}`)
    .join("\n");
}

async function readAppFile(appId: string, filePath: string): Promise<string> {
  const { data: fileRecord } = await supabase
    .from("app_files")
    .select("storage_path")
    .eq("app_id", appId)
    .eq("file_path", filePath)
    .single();

  if (!fileRecord) return `File not found: ${filePath}`;

  const { data, error } = await supabase.storage
    .from("entity-files")
    .download(fileRecord.storage_path);

  if (error || !data) return `Could not read file: ${filePath}`;

  return await data.text();
}

export async function runAgentTurn(
  messages: Message[],
  options: AgentRunOptions
): Promise<AgentRunResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const localMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content as Anthropic.MessageParam["content"],
  }));

  let lastQueryResult: QueryResult | undefined;

  const emit = options.onProgress ?? (() => {});
  const executedQueries: string[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    emit({ type: "thinking" });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: options.systemPrompt,
      tools: TOOLS,
      messages: localMessages,
    });

    // Build assistant message
    const assistantBlocks: Anthropic.ContentBlock[] = response.content;
    localMessages.push({ role: "assistant", content: assistantBlocks });

    const textBlock = response.content.find((b) => b.type === "text") as
      | Anthropic.TextBlock
      | undefined;
    const toolUses = response.content.filter(
      (b) => b.type === "tool_use"
    ) as Anthropic.ToolUseBlock[];

    if (response.stop_reason === "end_turn" || toolUses.length === 0) {
      messages.push(...(localMessages.slice(messages.length) as Message[]));
      return { finalText: textBlock?.text ?? "", queryResult: lastQueryResult, queries: executedQueries };
    }

    // Dispatch tool calls
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tool of toolUses) {
      let resultContent: string;

      try {
        switch (tool.name) {
          case "list_directory": {
            const p = (tool.input as { path: string }).path || ".";
            emit({ type: "listing_files" });
            resultContent = await listAppFiles(options.appId, p);
            break;
          }

          case "read_file": {
            const p = (tool.input as { path: string }).path;
            emit({ type: "reading_file", path: p });
            resultContent = await readAppFile(options.appId, p);
            break;
          }

          case "list_tables": {
            emit({ type: "listing_tables" });
            const tables = await listTables(options.datasetRef, options.accessToken);
            resultContent = JSON.stringify(tables, null, 2);
            break;
          }

          case "get_table_schema": {
            const tableId = (tool.input as { table_id: string }).table_id;
            emit({ type: "getting_schema", table: tableId });
            const schema = await getTableSchema(options.datasetRef, tableId, options.accessToken);
            resultContent = JSON.stringify(schema, null, 2);
            break;
          }

          case "run_query": {
            const sql = (tool.input as { sql: string }).sql;
            executedQueries.push(sql);
            emit({ type: "running_query", sql });
            console.log("[agent] run_query →", options.datasetRef.projectId, options.datasetRef.datasetId);
            console.log("[agent] SQL:\n" + sql);
            const result = await runQuery(options.datasetRef, sql, options.accessToken);
            lastQueryResult = result;
            emit({ type: "query_done", rows: result.totalRows });
            resultContent = JSON.stringify(
              {
                totalRows: result.totalRows,
                bytesProcessed: result.bytesProcessed,
                schema: result.schema,
                rows: result.rows.slice(0, 5),
              },
              null,
              2
            );
            break;
          }

          case "ask_clarification": {
            const question = (tool.input as { question: string }).question;
            messages.push(...(localMessages.slice(messages.length) as Message[]));
            return { finalText: "", clarification: question, queryResult: lastQueryResult, queries: executedQueries };
          }

          default:
            resultContent = `Unknown tool: ${tool.name}`;
        }
      } catch (err) {
        resultContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[agent] tool "${tool.name}" failed:`, err);
      }

      toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: resultContent });
    }

    localMessages.push({ role: "user", content: toolResults });
  }

  messages.push(...(localMessages.slice(messages.length) as Message[]));
  return {
    finalText: "Maximum iterations reached. Please try a more specific question.",
    queryResult: lastQueryResult,
    queries: executedQueries,
  };
}

export function buildSystemPrompt(
  datasetRef: DatasetRef,
  files: Array<{ file_path: string; category: string | null }>
): string {
  const fqPrefix = `${datasetRef.projectId}.${datasetRef.datasetId}`;

  const fileList =
    files.length > 0
      ? `## Entity files in this app\nThe following files are available. Use \`read_file\` to read the ones relevant to the question.\n\n${files.map((f) => `  ${f.file_path}${f.category ? ` [${f.category}]` : ""}`).join("\n")}`
      : `## Entity files\nNo entity files uploaded. Use \`list_tables\` and \`get_table_schema\` to discover the schema.`;

  return `You are a BigQuery SQL expert. Translate natural-language questions into accurate BigQuery SQL and execute them.

## Dataset
Target dataset: \`${fqPrefix}\`

${fileList}

## Workflow — follow this order strictly
1. **Read the entity file.** Find the relevant entity/model file and read it — table name, column names, types, and enum values are all there.
2. **Follow imports for enums — mandatory.** After reading an entity file, scan its imports. For any column filtering by status/type/role, read the imported enum file to get exact string values. Wrong values silently return 0 rows.
3. **Write and run the query immediately.** Use \`run_query\`. Do NOT call \`list_tables\` or \`get_table_schema\` first unless there are no entity files.
4. **Summarize** results in plain English.

## SQL rules
- Always use fully-qualified table references: \`${fqPrefix}.table_name\`
- Never use \`SELECT *\`. Name columns explicitly.
- Add \`LIMIT 1000\` for exploratory queries unless the user asks for all rows.
- If the question is truly ambiguous, use \`ask_clarification\` first.

## TypeORM naming conventions
Entity class → table: \`Contributor\` → \`contributor\`, \`TaskAssignment\` → \`task_assignment\`
Property → column: \`projectId\` → \`project_id\`, \`createdAt\` → \`created_at\`
Convert every PascalCase class name and camelCase property to lowercase snake_case in SQL.
`;
}
