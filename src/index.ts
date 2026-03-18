#!/usr/bin/env node
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { select, input } from '@inquirer/prompts';
import { loadConfig } from './config';
import { initPipeline, askQuestion } from './pipeline';
import { loadRecentDatasets, saveDataset } from './local/datasets';
import { buildFileIndex, saveFileIndex, loadFileIndex } from './local/indexer';
import { getLastModel, saveLastModel, getScanDir, saveScanDir } from './local/preferences';
import { isMonorepo, listPackages } from './local/monorepo';
import { MODEL_OPTIONS, ModelOption } from './llm/types';
import { createProvider } from './llm/factory';
import { displayError } from './utils/display';
import { loadGlobalConfig, saveGlobalConfig, configFilePath } from './global/config';

const repoDir = path.resolve(process.cwd());

async function runSetup(): Promise<void> {
  const existing = loadGlobalConfig();
  console.log(chalk.bold('\nAPI Key Setup') + chalk.dim(' — press Enter to keep existing value\n'));

  try {
    const anthropicApiKey = await input({
      message: 'Anthropic API key',
      default: existing.anthropicApiKey ?? '',
      transformer: (v) => v ? '****' + v.slice(-4) : chalk.dim('(none)'),
    });

    const openaiApiKey = await input({
      message: 'OpenAI API key (optional)',
      default: existing.openaiApiKey ?? '',
      transformer: (v) => v ? '****' + v.slice(-4) : chalk.dim('(skip)'),
    });

    saveGlobalConfig({
      anthropicApiKey: anthropicApiKey || undefined,
      openaiApiKey: openaiApiKey || undefined,
    });

    console.log(chalk.green(`\nSaved to ${configFilePath()}\n`));
  } catch {
    process.exit(0);
  }
}

async function pickScanDir(repoDir: string): Promise<string> {
  const saved = getScanDir(repoDir);
  const packages = listPackages(repoDir);
  const CHANGE = '  Change app selection';
  const FULL_REPO = '  Entire repo';

  if (saved) {
    const choice = await select({
      message: 'Monorepo detected — scoped app',
      choices: [
        { name: saved, value: saved },
        { name: chalk.dim(CHANGE), value: CHANGE },
      ],
    });
    if (choice !== CHANGE) return choice;
  }

  const choice = await select({
    message: 'Monorepo detected — which app maps to this dataset?',
    choices: [
      ...packages.map((p) => ({ name: p, value: p })),
      { name: chalk.dim(FULL_REPO), value: '' },
    ],
  });

  return choice;
}

async function pickModel(config: ReturnType<typeof loadConfig>, repoDir: string): Promise<ModelOption> {
  const available = MODEL_OPTIONS.filter((m) =>
    m.provider === 'anthropic' ? !!config.anthropicApiKey : !!config.openaiApiKey
  );

  if (available.length === 0) throw new Error('No API keys found.');
  if (available.length === 1) return available[0];

  const lastModel = getLastModel(repoDir);
  const defaultOption = available.find((m) => m.model === lastModel) ?? available[0];

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

function runIndex(repoDir: string, scanDir: string): ReturnType<typeof buildFileIndex> {
  const scanPath = scanDir ? path.join(repoDir, scanDir) : repoDir;
  const label = scanDir || 'project';
  process.stdout.write(chalk.dim(`Indexing ${label}...`));
  const index = buildFileIndex(scanPath);
  saveFileIndex(repoDir, index);
  process.stdout.write(chalk.dim(` ${index.files.length} files indexed.\n\n`));
  return index;
}

async function main() {
  console.log(chalk.bold('\nbq-write') + chalk.dim(' — BigQuery natural language query\n'));

  // Handle reindex command
  if (process.argv[2] === 'reindex') {
    const scanDir = getScanDir(repoDir) ?? '';
    const index = runIndex(repoDir, scanDir);
    const categories = [...new Set(index.files.map((f) => f.category))];
    categories.forEach((cat) => {
      const count = index.files.filter((f) => f.category === cat).length;
      console.log(chalk.dim(`  ${cat}: ${count} file(s)`));
    });
    console.log(chalk.green('\nIndex updated.'));
    return;
  }

  // Load config — auto-redirect to setup if no keys found
  let config;
  try {
    config = loadConfig();
  } catch {
    console.log(chalk.yellow('No API keys configured. Let\'s set them up.\n'));
    await runSetup();
    try {
      config = loadConfig();
    } catch (err) {
      displayError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }

  // Resolve scan dir (monorepo-aware)
  let scanDir = getScanDir(repoDir) ?? '';
  try {
    if (isMonorepo(repoDir)) {
      scanDir = await pickScanDir(repoDir);
      saveScanDir(repoDir, scanDir);
    }
  } catch {
    process.exit(0);
  }

  // File index
  let fileIndex = loadFileIndex(repoDir);
  if (!fileIndex) {
    fileIndex = runIndex(repoDir, scanDir);
  } else {
    const age = Math.round((Date.now() - new Date(fileIndex.createdAt).getTime()) / 3600000);
    const ageStr = age < 24 ? `${age}h ago` : `${Math.round(age / 24)}d ago`;
    const scope = scanDir || 'full repo';
    console.log(chalk.dim(`Index: ${fileIndex.files.length} files from ${scope} (${ageStr}) — run \`bq-write reindex\` to refresh\n`));
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
    provider = createProvider(modelOption!, {
      anthropicApiKey: config.anthropicApiKey,
      openaiApiKey: config.openaiApiKey,
    });
  } catch (err) {
    displayError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let pipeline;
  try {
    pipeline = initPipeline(dataset!, repoDir, scanDir, config, fileIndex, provider!);
  } catch (err) {
    displayError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const scope = scanDir || 'full repo';
  console.log(chalk.dim(`\nModel   : ${modelOption!.label.trim()}`));
  console.log(chalk.dim(`Dataset : ${dataset!}`));
  console.log(chalk.dim(`Project : ${repoDir} (${scope})`));
  console.log(chalk.dim('Type your question, or /setup, /switch, /reindex, exit.\n'));

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

    if (question === '/setup') {
      rl.pause();
      await runSetup();
      rl.resume();
      rl.prompt();
      return;
    }

    if (question === '/switch') {
      rl.close();
      await main();
      return;
    }

    if (question === '/reindex') {
      runIndex(repoDir, scanDir);
      rl.prompt();
      return;
    }

    if (question === '/help') {
      console.log(chalk.dim('\n  /setup    — update API keys'));
      console.log(chalk.dim('  /switch   — change model or dataset'));
      console.log(chalk.dim('  /reindex  — re-scan project files'));
      console.log(chalk.dim('  exit      — quit\n'));
      rl.prompt();
      return;
    }

    rl.pause();
    try {
      await askQuestion(pipeline!, question);
    } catch (err) {
      displayError(err instanceof Error ? err.message : String(err));
    }
    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

main();
