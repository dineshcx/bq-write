#!/usr/bin/env node
import { Command } from 'commander';
import * as readline from 'readline';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from './config';
import { initPipeline, askQuestion } from './pipeline';
import { scanLocalRepo } from './local/scanner';
import { saveContext, loadMeta, cacheExists } from './local/cache';
import { displayError } from './utils/display';

const program = new Command();

program
  .name('bq-write')
  .description('BigQuery natural language query CLI powered by Claude')
  .version('1.0.0');

// ── init ──────────────────────────────────────────────────────────────────────
program
  .command('init')
  .description('Scan the current repo and cache schema context for querying')
  .option('--dir <dir>', 'Project directory to scan (default: current directory)')
  .action((opts: { dir?: string }) => {
    const repoDir = path.resolve(opts.dir ?? process.cwd());
    const spinner = ora(`Scanning ${repoDir}...`).start();

    let config;
    try {
      config = loadConfig();
    } catch (err) {
      spinner.fail();
      displayError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    const context = scanLocalRepo(repoDir, config.contextMaxTokens);

    if (!context) {
      spinner.warn('No schema-relevant files found (models, migrations, SQL, etc.)');
      process.exit(0);
    }

    // Count sections = files included
    const fileCount = (context.match(/^### /gm) ?? []).length;
    saveContext(repoDir, context, fileCount);

    spinner.succeed(
      `Context cached: ${fileCount} files, ~${Math.ceil(context.length / 4).toLocaleString()} tokens → .bq-write/context.md`
    );
  });

// ── query ─────────────────────────────────────────────────────────────────────
program
  .command('query')
  .description('Ask a natural language question against a BigQuery dataset')
  .requiredOption('-d, --dataset <dataset>', 'BigQuery dataset (format: project.dataset)')
  .option('--dir <dir>', 'Project directory with .bq-write cache (default: current directory)')
  .option('-q, --question <question>', 'Question to ask (omit for interactive REPL mode)')
  .action(async (opts: { dataset: string; dir?: string; question?: string }) => {
    const repoDir = path.resolve(opts.dir ?? process.cwd());

    let config;
    try {
      config = loadConfig();
    } catch (err) {
      displayError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    if (!cacheExists(repoDir)) {
      console.log(chalk.yellow(`No context cache found in ${repoDir}.`));
      console.log(chalk.yellow('Run `bq-write init` first for best results.\n'));
    } else {
      const meta = loadMeta(repoDir);
      if (meta) {
        const age = Math.round((Date.now() - new Date(meta.createdAt).getTime()) / 3600000);
        const ageStr = age < 24 ? `${age}h ago` : `${Math.round(age / 24)}d ago`;
        console.log(chalk.dim(`Context: ${meta.fileCount} files, ~${meta.tokenCount.toLocaleString()} tokens (indexed ${ageStr})`));
      }
    }

    let pipeline;
    try {
      pipeline = initPipeline(opts.dataset, repoDir, config);
    } catch (err) {
      displayError(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    // One-shot mode
    if (opts.question) {
      try {
        await askQuestion(pipeline, opts.question);
      } catch (err) {
        displayError(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      return;
    }

    // REPL mode
    console.log(chalk.cyan('Ask questions in plain English. Type `exit` to quit.\n'));

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

      try {
        await askQuestion(pipeline, question);
      } catch (err) {
        displayError(err instanceof Error ? err.message : String(err));
      }

      rl.prompt();
    });

    rl.on('close', () => process.exit(0));
  });

program.parse();
