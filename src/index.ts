#!/usr/bin/env node
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { select, input } from '@inquirer/prompts';
import { loadConfig } from './config';
import { initPipeline, askQuestion } from './pipeline';
import { loadRecentDatasets, saveDataset } from './local/datasets';
import { displayError } from './utils/display';

const repoDir = path.resolve(process.cwd());

async function pickDataset(repoDir: string): Promise<string> {
  const recent = loadRecentDatasets(repoDir);

  if (recent.length > 0) {
    const NEW_OPTION = '+ Enter a new dataset';
    const choice = await select({
      message: 'Select a dataset',
      choices: [
        ...recent.map((d) => ({ name: d, value: d })),
        { name: chalk.dim(NEW_OPTION), value: NEW_OPTION },
      ],
    });

    if (choice !== NEW_OPTION) return choice;
  }

  return input({
    message: 'BigQuery dataset (format: project.dataset)',
    validate: (v) => {
      const normalized = v.replace(':', '.');
      return normalized.split('.').length === 2 && normalized.split('.').every(Boolean)
        ? true
        : 'Format must be project.dataset';
    },
  });
}

async function main() {
  console.log(chalk.bold('\nbq-write') + chalk.dim(' — BigQuery natural language query\n'));

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    displayError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let dataset: string;
  try {
    dataset = await pickDataset(repoDir);
  } catch {
    // User hit Ctrl+C during prompt
    process.exit(0);
  }

  saveDataset(repoDir, dataset);

  let pipeline;
  try {
    pipeline = initPipeline(dataset, repoDir, config);
  } catch (err) {
    displayError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(chalk.dim(`\nDataset: ${dataset}`));
  console.log(chalk.dim(`Project: ${repoDir}`));
  console.log(chalk.dim('Type your question, or `exit` to quit.\n'));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.bold('bq> '),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const question = line.trim();
    if (!question) { rl.prompt(); return; }

    if (['exit', 'quit', '.exit'].includes(question)) {
      console.log(chalk.dim('Goodbye!'));
      rl.close();
      return;
    }

    if (question === 'switch') {
      rl.close();
      await main();
      return;
    }

    try {
      await askQuestion(pipeline, question);
    } catch (err) {
      displayError(err instanceof Error ? err.message : String(err));
    }

    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

main();
