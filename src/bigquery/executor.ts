import { getBigQueryClient, DatasetRef } from './client';

export interface ColumnSchema {
  name: string;
  type: string;
  mode: string;
  description?: string;
}

export interface TableSchema {
  tableId: string;
  columns: ColumnSchema[];
  description?: string;
  numRows?: string;
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  totalRows: number;
  bytesProcessed: string;
  schema: ColumnSchema[];
}

export async function listTables(ref: DatasetRef): Promise<TableSchema[]> {
  const bq = getBigQueryClient(ref.projectId);
  const dataset = bq.dataset(ref.datasetId);
  const [tables] = await dataset.getTables();

  const schemas: TableSchema[] = [];
  for (const table of tables) {
    const [metadata] = await table.getMetadata();
    const fields: ColumnSchema[] = (metadata.schema?.fields ?? []).map(
      (f: { name: string; type: string; mode: string; description?: string }) => ({
        name: f.name,
        type: f.type,
        mode: f.mode ?? 'NULLABLE',
        description: f.description,
      })
    );
    schemas.push({
      tableId: table.id ?? '',
      columns: fields,
      description: metadata.description,
      numRows: metadata.numRows,
    });
  }
  return schemas;
}

export async function getTableSchema(ref: DatasetRef, tableId: string): Promise<TableSchema> {
  const bq = getBigQueryClient(ref.projectId);
  const table = bq.dataset(ref.datasetId).table(tableId);
  const [metadata] = await table.getMetadata();
  const fields: ColumnSchema[] = (metadata.schema?.fields ?? []).map(
    (f: { name: string; type: string; mode: string; description?: string }) => ({
      name: f.name,
      type: f.type,
      mode: f.mode ?? 'NULLABLE',
      description: f.description,
    })
  );
  return {
    tableId,
    columns: fields,
    description: metadata.description,
    numRows: metadata.numRows,
  };
}

export async function runQuery(
  ref: DatasetRef,
  sql: string,
  maxResults: number
): Promise<QueryResult> {
  const bq = getBigQueryClient(ref.projectId);

  const [job] = await bq.createQueryJob({
    query: sql,
    location: 'US',
    maximumBytesBilled: String(10 * 1024 * 1024 * 1024), // 10 GB safety cap
  });

  const [rows, , response] = await job.getQueryResults({ maxResults });

  const fields: ColumnSchema[] = (response?.schema?.fields ?? []).map(
    (f: { name?: string; type?: string; mode?: string; description?: string }) => ({
      name: f.name ?? '',
      type: f.type ?? 'STRING',
      mode: f.mode ?? 'NULLABLE',
      description: f.description,
    })
  );

  const statistics = (await job.getMetadata())[0].statistics;
  const bytesProcessed = statistics?.totalBytesProcessed ?? '0';

  return {
    rows: rows as Record<string, unknown>[],
    totalRows: rows.length,
    bytesProcessed,
    schema: fields,
  };
}
