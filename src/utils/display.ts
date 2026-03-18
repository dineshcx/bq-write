import Table from 'cli-table3';
import chalk from 'chalk';
import { QueryResult } from '../bigquery/executor';

export function displayQueryResult(result: QueryResult): void {
  if (result.rows.length === 0) {
    console.log(chalk.yellow('No rows returned.'));
    return;
  }

  const headers = result.schema.map((col) => chalk.bold(col.name));
  const table = new Table({ head: headers });

  for (const row of result.rows) {
    const values = result.schema.map((col) => {
      const val = (row as Record<string, unknown>)[col.name];
      if (val === null || val === undefined) return chalk.dim('NULL');
      if (typeof val === 'object') return JSON.stringify(val);
      return String(val);
    });
    table.push(values);
  }

  console.log(table.toString());

  const mb = (parseInt(result.bytesProcessed, 10) / 1024 / 1024).toFixed(2);
  console.log(
    chalk.dim(
      `\n${result.totalRows} row(s) · ${mb} MB processed`
    )
  );
}

export function displayError(message: string): void {
  console.error(chalk.red(`\nError: ${message}`));
}

export function displayInfo(message: string): void {
  console.log(chalk.cyan(message));
}
