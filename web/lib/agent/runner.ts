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
  | { type: "thought"; text: string }
  | { type: "reading_file"; path: string }
  | { type: "listing_files" }
  | { type: "listing_tables" }
  | { type: "getting_schema"; table: string }
  | { type: "running_query"; sql: string }
  | { type: "query_done"; rows: number }
  | { type: "memory_updated" };

// Ordered trace of every action the agent took
export type AgentStep =
  | { type: "thought"; text: string }
  | { type: "reading_file"; path: string }
  | { type: "listing_files" }
  | { type: "listing_tables" }
  | { type: "getting_schema"; table: string }
  | { type: "query"; sql: string; rows?: number; error?: string; preview?: Record<string, unknown>[]; schema?: Array<{ name: string; type: string }> }
  | { type: "memory_update" };

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
  steps: AgentStep[];
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
  {
    name: "update_memory",
    description: `Update the shared memory for this app with facts you've learned about the database schema.
This memory is shared across ALL datasets and users of this app, so keep it general and schema-focused.

INCLUDE — non-obvious facts that help write correct SQL:
- A column stores booleans as 0/1 instead of true/false
- Enum columns with their exact string values (e.g. status: 'active' | 'offboarded')
- JSON column structures and how to extract keys (e.g. JSON_VALUE syntax)
- Non-obvious join paths between tables
- Soft-delete patterns (e.g. deleted_at IS NOT NULL)

DO NOT INCLUDE:
- Workflow steps, SQL rules, naming conventions — those are already in the system prompt
- Dataset-qualified table names (write \`contributor\` not \`project.dataset.contributor\`)
- Point-in-time query results or row counts (these go stale)
- Anything that duplicates what is obvious from the schema or entity files

Format: short markdown sections per table, bullet points only. No prose, no instructions.`,
    input_schema: {
      type: "object" as const,
      properties: {
        content: {
          type: "string",
          description: "Full updated memory content in markdown. Rewrite the entire file — merge existing facts with new ones. Schema facts only, no instructions.",
        },
      },
      required: ["content"],
    },
  },
];

const MEMORY_BUCKET = "entity-files";
const memoryPath = (appId: string) => `${appId}/__memory__.md`;

export async function readAppMemory(appId: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(MEMORY_BUCKET)
    .download(memoryPath(appId));
  if (error || !data) return null;
  return await data.text();
}

async function writeAppMemory(appId: string, content: string): Promise<void> {
  await supabase.storage
    .from(MEMORY_BUCKET)
    .upload(memoryPath(appId), new Blob([content], { type: "text/markdown" }), {
      upsert: true,
    });
}

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

/**
 * When the previous turn ended with ask_clarification, the history ends with:
 *   assistant: [tool_use(ask_clarification, id=X)]
 *   user: "plain text clarification response"
 *
 * The API requires a tool_result immediately after a tool_use. Fix it by
 * converting the trailing user text message into a tool_result block.
 */
function fixClarificationHistory(
  msgs: Anthropic.MessageParam[]
): Anthropic.MessageParam[] {
  if (msgs.length < 2) return msgs;

  const last = msgs[msgs.length - 1];
  const prev = msgs[msgs.length - 2];

  if (
    last.role !== "user" ||
    typeof last.content !== "string" ||
    prev.role !== "assistant" ||
    !Array.isArray(prev.content)
  ) {
    return msgs;
  }

  const clarTool = (prev.content as Anthropic.ContentBlock[]).find(
    (b) => b.type === "tool_use" && (b as Anthropic.ToolUseBlock).name === "ask_clarification"
  ) as Anthropic.ToolUseBlock | undefined;

  if (!clarTool) return msgs;

  const fixed = [...msgs];
  fixed[fixed.length - 1] = {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: clarTool.id, content: last.content }],
  };
  return fixed;
}

export async function runAgentTurn(
  messages: Message[],
  options: AgentRunOptions
): Promise<AgentRunResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const localMessages: Anthropic.MessageParam[] = fixClarificationHistory(
    messages.map((m) => ({
      role: m.role,
      content: m.content as Anthropic.MessageParam["content"],
    }))
  );

  let lastQueryResult: QueryResult | undefined;

  const emit = options.onProgress ?? (() => {});
  const executedQueries: string[] = [];
  const steps: AgentStep[] = [];

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

    // Emit + record intermediate reasoning text (thought before tool calls)
    if (textBlock?.text && toolUses.length > 0) {
      emit({ type: "thought", text: textBlock.text });
      steps.push({ type: "thought", text: textBlock.text });
    }

    if (response.stop_reason === "end_turn" || toolUses.length === 0) {
      messages.push(...(localMessages.slice(messages.length) as Message[]));
      return { finalText: textBlock?.text ?? "", queryResult: lastQueryResult, queries: executedQueries, steps };
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
            steps.push({ type: "listing_files" });
            resultContent = await listAppFiles(options.appId, p);
            break;
          }

          case "read_file": {
            const p = (tool.input as { path: string }).path;
            emit({ type: "reading_file", path: p });
            steps.push({ type: "reading_file", path: p });
            resultContent = await readAppFile(options.appId, p);
            break;
          }

          case "list_tables": {
            emit({ type: "listing_tables" });
            steps.push({ type: "listing_tables" });
            const tables = await listTables(options.datasetRef, options.accessToken);
            resultContent = JSON.stringify(tables, null, 2);
            break;
          }

          case "get_table_schema": {
            const tableId = (tool.input as { table_id: string }).table_id;
            emit({ type: "getting_schema", table: tableId });
            steps.push({ type: "getting_schema", table: tableId });
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
            steps.push({ type: "query", sql, rows: result.totalRows, preview: result.rows.slice(0, 5), schema: result.schema });
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
            return { finalText: "", clarification: question, queryResult: lastQueryResult, queries: executedQueries, steps };
          }

          case "update_memory": {
            const content = (tool.input as { content: string }).content;
            await writeAppMemory(options.appId, content);
            emit({ type: "memory_updated" });
            steps.push({ type: "memory_update" });
            resultContent = "Memory updated.";
            break;
          }

          default:
            resultContent = `Unknown tool: ${tool.name}`;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        resultContent = `Error: ${msg}`;
        console.error(`[agent] tool "${tool.name}" failed:`, err);
        if (tool.name === "run_query") {
          const sql = (tool.input as { sql: string }).sql;
          steps.push({ type: "query", sql, error: msg });
        }
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
    steps,
  };
}

export function buildSystemPrompt(
  datasetRef: DatasetRef,
  files: Array<{ file_path: string; category: string | null }>,
  memory: string | null = null
): string {
  const fqPrefix = `${datasetRef.projectId}.${datasetRef.datasetId}`;

  const fileList =
    files.length > 0
      ? `## Entity files in this app\nThe following files are available. Use \`read_file\` to read the ones relevant to the question.\n\n${files.map((f) => `  ${f.file_path}${f.category ? ` [${f.category}]` : ""}`).join("\n")}`
      : `## Entity files\nNo entity files uploaded. Use \`list_tables\` and \`get_table_schema\` to discover the schema.`;

  const memorySection = memory?.trim()
    ? `## Shared knowledge (learned from previous queries)\nThis is accumulated knowledge about this dataset. Trust it — it was written by you or a previous run.\n\n${memory.trim()}\n`
    : "";

  return `You are a BigQuery SQL expert. Translate natural-language questions into accurate BigQuery SQL and execute them.

## Dataset
Target dataset: \`${fqPrefix}\`

${fileList}

${memorySection}
## Workflow — follow this order strictly
1. **Read the entity file.** Find the relevant entity/model file and read it — table name, column names, types, and enum values are all there.
2. **Follow imports for enums — mandatory.** After reading an entity file, scan its imports. For any column filtering by status/type/role, read the imported enum file to get exact string values. Wrong values silently return 0 rows.
3. **Write and run the query immediately.** Use \`run_query\`. Do NOT call \`list_tables\` or \`get_table_schema\` first unless there are no entity files.
4. **Summarize** results in plain English.
5. **Update memory if you learned a schema fact.** After a successful query, if you discovered something non-obvious about column types, enum values, JSON structure, or join patterns — call \`update_memory\`. Do NOT write workflow instructions, SQL rules, dataset names, or row counts into memory.

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
