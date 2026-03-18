import { BigQuery } from '@google-cloud/bigquery';

export interface DatasetRef {
  projectId: string;
  datasetId: string;
}

export function parseDatasetRef(datasetArg: string): DatasetRef {
  // Accepts "project.dataset" or "project:dataset"
  const normalized = datasetArg.replace(':', '.');
  const parts = normalized.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid dataset format: "${datasetArg}". Expected "project.dataset" or "project:dataset".`
    );
  }
  return { projectId: parts[0], datasetId: parts[1] };
}

let _client: BigQuery | null = null;

export function getBigQueryClient(projectId: string): BigQuery {
  if (!_client) {
    _client = new BigQuery({ projectId });
  }
  return _client;
}
