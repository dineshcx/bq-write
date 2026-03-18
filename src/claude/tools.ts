import Anthropic from '@anthropic-ai/sdk';

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_tables',
    description:
      'List all tables in the BigQuery dataset along with their schemas (column names, types, descriptions). Call this first to understand what tables are available.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_table_schema',
    description:
      'Get the detailed schema for a specific BigQuery table, including all columns, types, modes, and descriptions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        table_id: {
          type: 'string',
          description: 'The table ID within the dataset (just the table name, not fully qualified).',
        },
      },
      required: ['table_id'],
    },
  },
  {
    name: 'run_query',
    description:
      'Execute a BigQuery SQL query and return the results. Always use fully-qualified table references (project.dataset.table). Never use SELECT *; name columns explicitly. Add LIMIT 1000 for exploratory queries.',
    input_schema: {
      type: 'object' as const,
      properties: {
        sql: {
          type: 'string',
          description: 'The BigQuery SQL query to execute.',
        },
      },
      required: ['sql'],
    },
  },
  {
    name: 'ask_clarification',
    description:
      'Ask the user a clarifying question before generating SQL, when the question is ambiguous or requires additional context (e.g., which date range, which user segment).',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: {
          type: 'string',
          description: 'The clarifying question to ask the user.',
        },
      },
      required: ['question'],
    },
  },
];
