// BigQuery executor using Google OAuth token (REST API, no ADC needed)

export interface ColumnSchema {
  name: string;
  type: string;
  mode: string;
  description?: string;
}

export interface TableSchema {
  tableId: string;
  columns: ColumnSchema[];
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  totalRows: number;
  bytesProcessed: string;
  schema: ColumnSchema[];
}

export interface DatasetRef {
  projectId: string;
  datasetId: string;
}

async function bqFetch(url: string, accessToken: string, body?: unknown) {
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message ?? `BigQuery error ${res.status}`;
    console.error("[bq-executor] HTTP", res.status, url);
    console.error("[bq-executor] Error:", message);
    console.error("[bq-executor] Full response:", JSON.stringify(data, null, 2));
    throw new Error(message);
  }
  return data;
}

export async function listTables(
  ref: DatasetRef,
  accessToken: string
): Promise<string[]> {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(ref.projectId)}/datasets/${encodeURIComponent(ref.datasetId)}/tables?maxResults=1000`;
  const data = await bqFetch(url, accessToken);
  return (data.tables ?? []).map(
    (t: { tableReference: { tableId: string } }) => t.tableReference.tableId
  );
}

export async function getTableSchema(
  ref: DatasetRef,
  tableId: string,
  accessToken: string
): Promise<TableSchema> {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(ref.projectId)}/datasets/${encodeURIComponent(ref.datasetId)}/tables/${encodeURIComponent(tableId)}`;
  const data = await bqFetch(url, accessToken);
  const columns: ColumnSchema[] = (data.schema?.fields ?? []).map(
    (f: { name: string; type: string; mode: string; description?: string }) => ({
      name: f.name,
      type: f.type,
      mode: f.mode ?? "NULLABLE",
      description: f.description,
    })
  );
  return { tableId, columns };
}

export async function runQuery(
  ref: DatasetRef,
  sql: string,
  accessToken: string,
  maxResults = 100
): Promise<QueryResult> {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${encodeURIComponent(ref.projectId)}/queries`;
  const data = await bqFetch(url, accessToken, {
    query: sql,
    useLegacySql: false,
    timeoutMs: 30000,
    maxResults,
    location: "US",
  });

  const schema: ColumnSchema[] = (data.schema?.fields ?? []).map(
    (f: { name: string; type: string; mode: string; description?: string }) => ({
      name: f.name,
      type: f.type,
      mode: f.mode ?? "NULLABLE",
      description: f.description,
    })
  );

  const rows = (data.rows ?? []).map((row: { f: { v: unknown }[] }) =>
    Object.fromEntries(row.f.map((cell, i) => [schema[i]?.name ?? `col${i}`, cell.v]))
  );

  return {
    rows,
    totalRows: Number(data.totalRows ?? rows.length),
    bytesProcessed: data.cacheHit ? "0 (cached)" : (data.statistics?.totalBytesProcessed ?? "0"),
    schema,
  };
}
