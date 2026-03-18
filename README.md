# bq-write

Ask questions about your data in plain English. `bq-write` reads your app's source code to understand your schema — entity names, column types, enum values, table relationships — then generates accurate BigQuery SQL and runs it.

```
bq> how many users completed a conversation in project 661?

  → read src/app/conversations/conversation.entity.ts
  → read src/app/conversations/enums/conversation-status.enum.ts

SELECT COUNT(*) AS total
FROM my-project.my_dataset.conversation
WHERE project_id = 661
  AND status = 'completed'

→ Query done — 1 row(s)

  ┌───────┐
  │ total │
  ├───────┤
  │ 4     │
  └───────┘

There are 4 completed conversations in project 661.
```

---

## How it works

An AI agent reads your entity and enum files to understand the domain — column names, status values, relationships — then writes and executes BigQuery SQL directly. No hallucinated column names, no wrong enum values.

Supports **Anthropic** (Opus, Sonnet, Haiku) and **OpenAI** (GPT-4o, GPT-4o Mini) — works with whichever API key you have.

---

## Installation

```bash
npm install -g bq-write
```

**Requirements:**
- Node.js 18+
- Anthropic API key and/or OpenAI API key
- Google Cloud credentials (see [BigQuery auth](#bigquery-auth))

---

## Setup

### 1. API keys

Run once after installation — `bq-write` will prompt automatically on first run too:

```bash
bq-write setup
# ? Anthropic API key › sk-ant-...
# ? OpenAI API key (optional) › sk-...
# ✔ Saved to ~/.config/bq-write/config.json
```

You only need one key. Keys are stored in `~/.config/bq-write/config.json` and never need to be set again.

### 2. BigQuery auth

```bash
gcloud auth application-default login
```

Don't have `gcloud`?
```bash
brew install google-cloud-sdk   # macOS
```

---

## Usage

Run from inside your project directory:

```bash
cd ~/my-app
bq-write
```

On first run it will:
1. Auto-redirect to setup if no API keys are configured
2. Detect monorepos and ask which app to scope to
3. Index entity/model files from your project
4. Ask which model and dataset to use

Then you're in the REPL:

```
Model   : GPT-4o  (OpenAI)
Dataset : my-project.my_dataset
Project : /Users/you/my-app

bq> how many users signed up this month?
bq> break that down by country
bq> exit
```

### REPL commands

| Command | Description |
|---|---|
| `/setup` | Update API keys |
| `/switch` | Change model or dataset |
| `/reindex` | Re-scan project files |
| `/help` | Show all commands |
| `exit` | Quit |

### Monorepo support

If your project has an `apps/` or `packages/` directory, `bq-write` detects it and asks which app maps to your dataset:

```
? Monorepo detected — which app maps to this dataset?
❯ apps/api
  apps/worker
  apps/admin
    Entire repo
```

The selection is remembered. Run `bq-write reindex` after changing it.

---

## BigQuery auth

`bq-write` uses Google Application Default Credentials. Run once:

```bash
gcloud auth application-default login
```

Your Google account needs **BigQuery Data Viewer** and **BigQuery Job User** roles on the project.

---

## Environment variables

Optional overrides — prefer `bq-write setup` for API keys.

| Variable | Default | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Overrides saved Anthropic key |
| `OPENAI_API_KEY` | — | Overrides saved OpenAI key |
| `BQ_MAX_RESULTS` | `100` | Max rows returned per query |
| `CONTEXT_MAX_TOKENS` | `80000` | Token budget for file reads per turn |

---

## Contributing

Issues and PRs welcome at [github.com/dinesh-choudhary-dev/bq-write](https://github.com/dinesh-choudhary-dev/bq-write).

## License

MIT
