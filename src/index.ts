#!/usr/bin/env node
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { select, input } from '@inquirer/prompts';
import { loadConfig } from './config';
import { initPipeline, askQuestion } from './pipeline';
import { loadRecentDatasets, saveDataset } from './local/datasets';
import { buildFileIndex, saveFileIndex, loadFileIndex } from './local/indexer';
import { getLastModel, saveLastModel } from './local/preferences';
import { MODEL_OPTIONS, ModelOption } from './llm/types';
import { createProvider } from './llm/factory';
import { displayError } from './utils/display';

const repoDir = path.resolve(process.cwd());

async function pickModel(config: ReturnType<typeof loadConfig>, repoDir: string): Promise<ModelOption> {
  // Filter to models whose provider key is available
  const available = MODEL_OPTIONS.filter((m) =>
    m.provider === 'anthropic' ? !!config.anthropicApiKey : !!config.openaiApiKey
  );

  if (available.length === 0) {
    throw new Error('No API keys found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.');
  }

  const lastModel = getLastModel(repoDir);
  const defaultOption = available.find((m) => m.model === lastModel) ?? available[0];

  if (available.length === 1) return available[0];

  const chosen = await select({
    message: 'Select a model',
    default: defaultOption.model,
    choices: available.map((m) => ({ name: m.label, value: m.model })),
  });

  return available.find((m) => m.model === chosen)!;
}

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

function runIndex(repoDir: string): ReturnType<typeof buildFileIndex> {
  process.stdout.write(chalk.dim('Indexing project files...'));
  const index = buildFileIndex(repoDir);
  saveFileIndex(repoDir, index);
  process.stdout.write(chalk.dim(` ${index.files.length} files indexed.\n\n`));
  return index;
}

async function main() {
  console.log(chalk.bold('\nbq-write') + chalk.dim(' — BigQuery natural language query\n'));

  // Handle reindex command
  if (process.argv[2] === 'reindex') {
    const index = runIndex(repoDir);
    const categories = [...new Set(index.files.map((f) => f.category))];
    categories.forEach((cat) => {
      const count = index.files.filter((f) => f.category === cat).length;
      console.log(chalk.dim(`  ${cat}: ${count} file(s)`));
    });
    console.log(chalk.green('\nIndex updated.'));
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    displayError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // File index
  let fileIndex = loadFileIndex(repoDir);
  if (!fileIndex) {
    fileIndex = runIndex(repoDir);
  } else {
    const age = Math.round((Date.now() - new Date(fileIndex.createdAt).getTime()) / 3600000);
    const ageStr = age < 24 ? `${age}h ago` : `${Math.round(age / 24)}d ago`;
    console.log(chalk.dim(`Index: ${fileIndex.files.length} files (indexed ${ageStr}) — run \`bq-write reindex\` to refresh\n`));
  }

  let modelOption: ModelOption;
  let dataset: string;

  try {
    modelOption = await pickModel(config, repoDir);
    saveLastModel(repoDir, modelOption.model);
    dataset = await pickDataset(repoDir);
  } catch {
    process.exit(0);
  }

  saveDataset(repoDir, dataset);

  let provider;
  try {
    provider = createProvider(modelOption, {
      anthropicApiKey: config.anthropicApiKey,
      openaiApiKey: config.openaiApiKey,
    });
  } catch (err) {
    displayError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let pipeline;
  try {
    pipeline = initPipeline(dataset, repoDir, config, fileIndex, provider);
  } catch (err) {
    displayError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log(chalk.dim(`\nModel   : ${modelOption.label.trim()}`));
  console.log(chalk.dim(`Dataset : ${dataset}`));
  console.log(chalk.dim(`Project : ${repoDir}`));
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
