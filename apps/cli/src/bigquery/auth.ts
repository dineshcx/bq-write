import chalk from 'chalk';

const CREDENTIAL_ERROR_PATTERNS = [
  'could not load the default credentials',
  'application default credentials',
  'unauthenticated',
  'invalid_grant',
];

export function isCredentialError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return CREDENTIAL_ERROR_PATTERNS.some((p) => msg.includes(p));
}

export function printCredentialHelp(): void {
  console.error(chalk.red('\nBigQuery authentication failed.\n'));
  console.error('Set up Google Application Default Credentials by running:\n');
  console.error(chalk.bold('  gcloud auth application-default login\n'));
  console.error(chalk.dim('Don\'t have gcloud? Install it first:'));
  console.error(chalk.dim('  brew install google-cloud-sdk       # macOS'));
  console.error(chalk.dim('  https://cloud.google.com/sdk/docs/install  # other\n'));
  console.error(chalk.dim('Also ensure your Google account has these roles on the project:'));
  console.error(chalk.dim('  • BigQuery Data Viewer'));
  console.error(chalk.dim('  • BigQuery Job User\n'));
}
