# langgraph-fix-issues-pipeline

> ⚠️ **Weekend prototype — not production software.**
> Built as a proof-of-concept to explore agentic code-fix pipelines.
> It works end-to-end but is **not hardened, not optimised, and not meant for production**.
> Don't deploy this to real repos without serious hardening.
> Check out [Possible Improvements](#-possible-improvements) for what a production version would need.

An agentic pipeline that automatically fixes GitHub issues. A polling worker picks up issues from a SQLite database, spins up an isolated Docker container with the target repo, and runs a multi-step LangGraph pipeline: analyse the issue, plan a fix, implement it, review the code, and open a PR — all hands-free.

> 💡 **This is a prototype.** See [🔧 Possible Improvements](#-possible-improvements) at the bottom for what a production version would need.

## 📋 Prerequisites

- **Node.js** >= 20
- **pnpm** 10.4.0
- **Docker** running locally (the worker creates containers on the fly)
- **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com))
- **GitHub personal access token** with `repo` scope

## 🚀 Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd langgraph-fix-issues-pipeline

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env
```

Edit `.env` and fill in the required values:

```env
ANTHROPIC_API_KEY=sk-ant-...       # Required — Claude API key
GITHUB_TOKEN=ghp_...               # Required — GitHub PAT with repo scope
GITHUB_REPO=owner/repo             # Required — target repository
```

See [Environment Variables](#-environment-variables) for the full list.

## ▶️ Running

```bash
# Create the SQLite database
pnpm db:migrate

# Insert a test issue (edit apps/db-helper/src/insert.ts to change the issue text)
pnpm db:insert

# Start the worker (hot-reload mode)
pnpm worker:dev
```

The worker picks up the issue, spins up a Docker container, runs the pipeline, and opens a PR on the target repo.

## 🧠 How It Works

### Current Prototype Flow

Issues are inserted into a local SQLite database manually via a helper script (`pnpm db:insert`). The worker polls this database for new issues.

### Intended Production Flow

The idea is to set up a **GitHub webhook** on `issues.opened` (or use GitHub Actions) that inserts a row into an external database (e.g. PostgreSQL, PlanetScale) whenever a new issue is created. The worker would poll that database instead of a local SQLite file. The current SQLite + helper script approach is just a stand-in for prototyping.

### Pipeline

```
START
  │
  ▼
format_input ──(invalid)──► log_and_notify ──► END
  │
  (valid)
  │
  ▼
issue_intake ──(fail after retries)──► log_and_notify
  │
  (success)
  │
  ▼
plan_generation ──(fail)──► log_and_notify
  │
  (success)
  │
  ▼
code_implementation ◄──(changes requested)──┐
  │                                         │
  (success)                                 │
  │                                         │
  ▼                                         │
code_review ────────────────────────────────┘
  │
  (approved)
  │
  ▼
integrate ──► log_and_notify ──► END
```

Each node is a factory function (`createXxxNode()`) that gets the full graph state and returns a partial state update. Conditional edges handle retries and error routing.

### Polling Loop

The worker runs a continuous loop:
1. Claims the next open issue from SQLite (atomic `UPDATE ... RETURNING`)
2. Spins up a Docker container with the target repo cloned
3. Runs the issue pipeline (intake → plan → code → review → integrate)
4. Updates the issue status to `success` or `failed` in the database
5. Cleans up the Docker container
6. Sleeps `POLL_INTERVAL_MS` before the next iteration

Each run has a configurable timeout (`PIPELINE_TIMEOUT_MS`). On timeout, the container is cleaned up and the issue is marked as failed.

### Graceful Shutdown

Send `SIGINT` (Ctrl+C) or `SIGTERM` to stop the worker. It finishes the current iteration before exiting.

## 📁 Monorepo Structure

```
├── apps/
│   ├── worker        # Polling worker with LangGraph issue pipeline
│   └── db-helper     # CLI scripts for SQLite management
├── packages/
│   └── backend       # Shared types, state definitions, and DB layer
├── nx.json
├── pnpm-workspace.yaml
└── package.json
```

## 📝 Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm worker:dev` | Run worker with hot reload |
| `pnpm worker:build` | Build worker for production |
| `pnpm worker:start` | Run compiled worker |
| `pnpm worker:test` | Run worker tests only |
| `pnpm db:migrate` | Create/update database tables |
| `pnpm db:insert` | Insert a hardcoded test issue |

## 🌍 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Required. Claude API key |
| `ANTHROPIC_MODEL` | `sonnet` | Claude model to use |
| `GITHUB_TOKEN` | — | Required. GitHub access token with `repo` scope |
| `GITHUB_REPO` | — | Required. Target repo (`owner/repo`) |
| `BASE_BRANCH` | `devel` | Branch to clone and base PRs on |
| `IS_DEBUG` | `false` | Enable verbose logging |
| `DATABASE_PATH` | `./data/issues.db` | Path to the SQLite database file |
| `POLL_INTERVAL_MS` | `10000` | Milliseconds between poll iterations |
| `PIPELINE_TIMEOUT_MS` | `600000` | Max milliseconds per pipeline run (10 min) |

## ✅ Testing

```bash
pnpm test        # Run all tests (69 tests across 9 files)
pnpm worker:test # Run worker tests only
```

Tests cover all pipeline nodes and routing logic. External dependencies (Docker, Claude API) are fully mocked — no API keys or Docker needed to run tests.

## 🛠️ Tech Stack

- **Runtime:** Node.js (ESM)
- **Language:** TypeScript (strict mode)
- **AI:** LangGraph + LangChain + Claude (Anthropic)
- **Database:** SQLite via better-sqlite3
- **Containers:** Docker (Dockerode)
- **Build:** Nx + pnpm workspaces
- **Testing:** Vitest

## 🔧 Possible Improvements

**Not every node needs the same model.** Right now the pipeline runs the same Claude model for everything — intake, planning, coding, review, integration. Lightweight nodes like validation and routing could use a cheaper, faster model (e.g. Haiku) and save the heavy hitter for coding and review. Would cut cost and latency a lot.

### 🤖 Model Reliability

Nodes validate output with Zod + `zodToJsonSchema()` and retry at the graph level via state counters. The gaps:

- Feed Zod validation errors back into the prompt on retry instead of retrying blind — the model can usually self-correct if it knows what went wrong
- Split reasoning from JSON extraction into two calls (think first, format second) — fewer malformed outputs
- Add a self-review step where the model sanity-checks its own output before the next node runs (e.g. "do these file paths actually exist?"), bail to a human if confidence is low
- Scan generated code for obvious bad patterns (`rm -rf`, `eval(`, `process.exit`) and validate file paths against `git ls-files` before committing
- Set `max_tokens` per node — a classification call shouldn't burn 4k tokens

### 🐳 Docker Container Security

Containers run as non-root (`USER claude` in the Dockerfile) but that's about it:

- Lock down networking — drop all outbound by default, allowlist GitHub API CIDRs only, block the metadata endpoint (`169.254.169.254`), isolate each job on its own bridge network
- Set resource limits: `--cpus=1.0 --memory=2g --pids-limit=256`, disable swap, throttle disk I/O
- Stop passing API keys as env vars — mount as files under `/run/secrets/` or pull from a secrets manager
- Log what's happening inside containers — `docker events` to a log sink, or Falco for syscall-level auditing

### 🧪 Test Coverage

There are some tests but they don't test real LLM responses:

- No end-to-end graph test — should compile the full graph and run it against recorded LLM responses (record once, replay in CI)
- No test for the polling loop — needs an in-memory SQLite, a seed issue, one claim-process-mark cycle with mocked LLM, assert the final row status
- DB layer is untested — `claimNextIssue`, `markFailed`, `markSuccess` need tests against `:memory:` SQLite (doubles as migration regression coverage)
- Docker client helpers (`docker/`) have no tests — use `testcontainers` or inject a fake `DockerClient`
- Could add a nightly `test:e2e` job that runs the real pipeline and uses a second LLM call to score the output

### 💸 Cost Monitoring

**Not implemented at all.** The pipeline has zero cost tracking, no budgets, no spending alerts. Every node calls the Claude API with no guardrails on spend.

- Track token usage and cost per node per run — the API response already includes `usage.input_tokens` and `usage.output_tokens`
- Set a per-run cost threshold (e.g. $2) — abort the pipeline if cumulative cost exceeds it mid-run
- Set a daily/monthly budget with automatic circuit-breaker — stop claiming new issues once the budget is gone
- Store per-run cost in the database for historical tracking and dashboarding
- Alert (Slack, email, PagerDuty) when a single run costs more than expected or daily spend spikes
- The logger already calculates per-call cost in debug mode but nothing persists or aggregates it

### ⚙️ Infrastructure & Operations

- Swap SQLite for PostgreSQL to support multiple workers — use `SELECT ... FOR UPDATE SKIP LOCKED` for safe concurrent claiming
- Add a webhook endpoint for `issues.opened` — verify `X-Hub-Signature-256`, dedupe on `X-GitHub-Delivery`, insert into the DB, return 200
- Add `retry_count` and `last_error` columns — re-claim failed issues up to 3 times with backoff, then mark as dead and alert
- Wrap Anthropic calls with exponential backoff on 429/5xx and a circuit breaker so one API blip doesn't crash the loop
- Replace `console.log` with `pino` — JSON output, `issueId` + `runId` on every line, ship to a log aggregator
