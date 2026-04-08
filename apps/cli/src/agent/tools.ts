import Anthropic from '@anthropic-ai/sdk';

export const TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_directory',
    description:
      'List files and subdirectories at a given path within the project repo. Use this to explore the structure and find relevant schema/model files before reading them.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to list (e.g. "." for root, "app/models", "db/migrations"). Must stay within the project directory.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description:
      'Read the contents of a file in the project repo. Use this to read model definitions, migrations, schema files, etc. to understand column semantics before writing SQL.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string',
          description: 'Relative path to the file (e.g. "app/models/user.rb"). Must stay within the project directory.',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_tables',
    description:
      'List all tables in the BigQuery dataset along with their schemas (column names, types, descriptions). Call this to understand the live schema before writing SQL.',
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
      'Ask the user a clarifying question when the request is ambiguous and you need more information before generating SQL.',
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
