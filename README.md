# bq-write

Ask questions about your data in plain English. `bq-write` reads your app's source code to understand your schema — column meanings, status codes, table relationships — then uses Claude to generate accurate BigQuery SQL and run it.

```
bq> How many active users signed up in the last 7 days?

  → ls app/models
  → read app/models/user.rb
  → Listing BQ tables...
  → Running query...

  ┌──────────────┬───────┐
  │ signup_date  │ count │
  ├──────────────┼───────┤
  │ 2026-03-11   │ 312   │
  │ 2026-03-12   │ 289   │
  └──────────────┴───────┘

  2,041 new active users over the last 7 days.
```

---

## How it works

Claude is given `list_directory` and `read_file` tools scoped to your project directory. When you ask a question, it explores your source code to find the relevant model or migration files, reads only what it needs, then calls BigQuery to run the query — no pre-indexing, no embeddings, no setup.

---

## Installation

```bash
npm install -g bq-write
```

**Requirements:**
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)
- Google Cloud credentials ([see below](#bigquery-auth))

---

## Setup

### 1. Set your API key

Add to `~/.zshrc` or `~/.bashrc`:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Then reload: `source ~/.zshrc`

### 2. BigQuery auth

```bash
gcloud auth application-default login
```

---

## Usage

### Run from inside your project

```bash
cd ~/my-app
bq-write query --dataset "my-project.my_dataset"
```

```
Project: /Users/you/my-app
Ask questions in plain English. Type `exit` to quit.

bq> How many active users signed up this month?
bq> Break that down by country
bq> exit
```

### Run from anywhere with `--dir`

```bash
bq-write query --dataset "my-project.my_dataset" --dir ~/my-app
```

### One-shot

```bash
bq-write query \
  --dataset "my-project.my_dataset" \
  --question "How many orders were refunded last month?"
```

---

## Options

```
bq-write query [options]

  -d, --dataset <dataset>    BigQuery dataset — required (format: project.dataset)
  --dir <dir>                Project source directory (default: current directory)
  -q, --question <question>  Ask a single question and exit (omit for REPL)
```

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | — | Your Anthropic API key |
| `BQ_MAX_RESULTS` | No | `100` | Max rows returned per query |
| `CONTEXT_MAX_TOKENS` | No | `80000` | Token budget for file reads per turn |

---

## Contributing

Issues and PRs welcome at [github.com/dinesh-choudhary-dev/bq-write](https://github.com/dinesh-choudhary-dev/bq-write).

## License

MIT
