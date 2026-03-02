# langgraph-fix-issues-pipeline

An agentic pipeline that automatically fixes GitHub issues. A polling worker picks up issues from a database, spins up an isolated Docker container with the target repo, and runs a multi-step LangGraph pipeline: analyse the issue, plan a fix, implement it, review the code, and open a PR.

In production this would be backed by a database (e.g. PostgreSQL, Planetscale...) populated by a GitHub webhook on `issues.opened`. **The prototype uses a local SQLite instead, and `pnpm db:insert` simulates that webhook by manually inserting an issue**.

> ⚠️ **Weekend prototype — not production software.** It works end-to-end but is not hardened or optimised. See [Possible Improvements](#-possible-improvements) for what a production version would need.

## 🚀 Getting Started

### Prerequisites

- **Node.js** >= 20
- **pnpm** 10.4.0
- **Docker** running locally (the worker creates containers on the fly)
- **Anthropic API key** ([console.anthropic.com](https://console.anthropic.com))
- **GitHub personal access token** with `repo` scope

### Setup

```bash
git clone <repo-url>
cd langgraph-fix-issues-pipeline
pnpm install
cp .env.example .env
```

Edit `.env` with the required values (see [Environment Variables](#-environment-variables) for the full list):

| Variable | Example | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Claude API key |
| `GITHUB_TOKEN` | `ghp_...` | GitHub PAT with `repo` scope |
| `GITHUB_REPO` | `owner/repo` | Target repository to fix issues in |

### Run the pipeline

> **Before running:** open `apps/db-helper/src/insert.ts` and fill in the `title` and `body` fields with the GitHub issue you want the pipeline to fix. `pnpm db:insert` reads directly from this file!!!

```bash
pnpm db:migrate   # Create the SQLite database
pnpm db:insert    # Insert the issue from insert.ts into SQLite
pnpm worker:dev   # Start the worker (hot-reload)
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
format_input ─────── error ─────────────────────┐
  │                                              │
  ▼                                              │
issue_intake ◄─── retry ─┐                       │
  │                       │                      │
  ├── fail, has retries ──┘                      │
  │                                              │
  ├── fail, no retries ─────────────────────────► │
  │                                              │
  ▼                                              │
plan_generation ──── error ─────────────────────► │
  │                                              │
  ▼                                              │
code_implementation ◄── changes requested ─┐     │
  │                                        │     │
  ├── error ──────────────────────────────►│      │
  │                                        │     │
  ▼                                        │     │
code_review ───────────────────────────────┘      │
  │                                              │
  ├── rejected, no retries ─────────────────────► │
  │                                              │
  ▼                                              │
integrate                                        │
  │                                              │
  ▼                                              │
log_and_notify ◄──────────────────────────────────┘
  │
  ▼
 END
```

Each node is a factory function (`createXxxNode()`) that gets the full graph state and returns a partial state update. Conditional edges handle retries and error routing.

Key implementation details:
- **Tool access control** — planner and reviewer nodes are read-only (no file writes allowed), only the coder node can modify files
- **Structured output** — nodes use Zod schemas with `zodToJsonSchema()` to enforce structured JSON responses from the LLM
- **Retry with feedback** — when validation fails or the reviewer requests changes, the error/feedback is fed back into the prompt so the model can self-correct

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
| `ANTHROPIC_MODEL` | `sonnet` | Claude model for heavy nodes (planning, coding, review) |
| `ANTHROPIC_FAST_MODEL` | `haiku` | Cheaper/faster model for lightweight nodes (input formatting, intake, integration) |
| `GITHUB_TOKEN` | — | Required. GitHub access token with `repo` scope |
| `GITHUB_REPO` | — | Required. Target repo (`owner/repo`) |
| `BASE_BRANCH` | `devel` | Branch to clone and base PRs on |
| `IS_DEBUG` | `false` | Enable verbose logging |
| `DATABASE_PATH` | `./data/issues.db` | Path to the SQLite database file |
| `POLL_INTERVAL_MS` | `10000` | Milliseconds between poll iterations |
| `PIPELINE_TIMEOUT_MS` | `600000` | Max milliseconds per pipeline run (10 min) |

## ✅ Testing

```bash
pnpm test        # Run all tests (89 tests across 9 files)
pnpm worker:test # Run worker tests only
```

Tests cover all pipeline nodes and routing logic. External dependencies (Docker, Claude API) are fully mocked — no API keys or Docker needed to run tests.

## 🔧 Possible Improvements

### 💸 Cost Monitoring

Per-node cost tracking is already in place — every API call records input/output tokens and estimated cost in a `costs` array on the graph state, and a summary table is printed at the end of each run. Still missing:

- **Per-run budget** — abort the pipeline if cumulative cost exceeds a threshold (e.g. $2) mid-run
- **Daily/monthly circuit-breaker** — stop claiming new issues once the spending limit is reached
- **Persistent storage** — write per-run costs to the database for historical tracking and dashboarding
- **Alerting** — notify via Slack, email, or PagerDuty when a single run costs more than expected or daily spend spikes

### 🤖 Model Selection per Node

Partially implemented — `ANTHROPIC_FAST_MODEL` (defaults to Haiku) is already used by lightweight nodes (`format_input`, `issue_intake`, `integrate`), while heavier nodes (planning, coding, review) use `ANTHROPIC_MODEL`. Next steps:

- **Per-node config map** — make the model configurable per-node instead of a binary fast/full split
- **Provider-agnostic abstraction** — decouple nodes from Anthropic so they can run on any LLM provider (OpenAI, Gemini, local models) via a shared interface
- **Even cheaper models** for pure validation and routing steps that don't require reasoning
- **Per-node `max_tokens`** — a classification call shouldn't burn 4k tokens

### 🤖 Model Reliability

Nodes validate output with Zod schemas and retry at the graph level via state counters. Gaps:

- **Two-step generation** — split reasoning from JSON extraction into separate calls (think first, format second) to reduce malformed outputs
- **Self-review gate** — have the model sanity-check its own output before the next node runs (e.g. "do these file paths actually exist?") and bail to a human if confidence is low
- **Output scanning** — reject generated code containing dangerous patterns (`rm -rf`, `eval(`, `process.exit`) and validate file paths against `git ls-files` before committing
- **AST validation** — parse LLM-generated code with tree-sitter to verify structural correctness before accepting patches; use AST diffing to confirm changes only touch intended code regions; reject and re-prompt on parse failures
- **Dependency graph** — build a graph of inter-file imports and package dependencies (from `package.json`, `tsconfig.json` references, ESM import statements) so the agent understands which modules are upstream/downstream of a change; use tree-sitter to extract definitions and references, then rank files by relevance to select the most useful context within a token budget. Becomes essential when the codebase does not fit into the model's context window.
- **Impact analysis** — before applying a fix, trace all callers and consumers of the modified code to estimate blast radius; run only affected tests for fast feedback in the correction loop; flag breaking changes to shared interfaces or exported types. When the codebase does not fit into context, impact analysis ensures the pipeline focuses on the right slice of code and runs only relevant tests.
- **RAG retrieval** — index the codebase (embeddings or BM25) and retrieve relevant files, type definitions, tests, and similar past fixes at issue-intake time; provides the LLM with accurate, project-specific context instead of relying on what fits in the prompt window. When the codebase does not fit into context, RAG ensures the model still sees the most relevant code for each issue.
- **Ownership boundaries** — parse CODEOWNERS files and module/package boundaries to scope agent changes to the relevant module and prevent unintended modifications to unrelated code; treat the agent as another contributor subject to the same ownership and review rules as humans
- **Coding conventions** — extract project conventions from linter configs (ESLint/Prettier rules), instruction files (`CLAUDE.md`), and TypeScript compiler options, then inject them as system-prompt constraints so generated code matches the project's style; automated convention detection (scanning for naming patterns, import styles, structural preferences) can build these constraints dynamically
- **Relevant file retrieval** — combine multiple retrieval strategies: embeddings-based search for natural-language queries, AST-based repo maps (tree-sitter + PageRank) for deterministic structural context, and grep/lexical search for exact symbol lookup; no single method reliably covers both semantic intent and exact references, so a hybrid approach with re-ranking produces the best results

**Error-handling design patterns** (in LangGraph terms):

- **Ambiguous requirements** — conditional edge to a human-in-the-loop node (`interrupt_before`); if the issue description is too vague for the planner to produce a confident plan, route to a human for clarification before the coding step begins
- **Model hallucination** — Pydantic/Zod validation at every node boundary (structured outputs); e.g. if the Coder node returns a `CodeChange` model where `files_modified` is empty or the diff doesn't parse, reject immediately without human review and re-prompt
- **CI failure** — retry edge with error context injected into state (`state["ci_errors"].append(parsed_error)`), max retry count, then escalation; the Coder gets specific error context, re-generates only affected files, up to 3 retries, then escalates to human with full trace
- **Context too large** — chunking strategies, summarization sub-graph, hierarchical planning; when the issue touches too many files, break it into smaller sub-tasks via a planning node before handing off to the coder

**Observability:**

- **LangSmith tracing** — enable with `LANGCHAIN_TRACING_V2=true`; captures every node execution as a hierarchical trace (LLM inputs/outputs, tool calls, token usage, latency, cost); aggregate dashboards with P50/P99 latency, error rates, and cost breakdowns for monitoring the pipeline in production
- **OpenTelemetry integration** — export structured spans to any OTel-compatible backend (Datadog, Grafana, SigNoz) for vendor-neutral tracing; each agent step becomes a span with parent-child relationships capturing the full execution hierarchy; useful for correlating agent latency with API rate limits or infrastructure events
- **Per-node logging** — at each node capture: full state snapshot (for replay/debugging), token counts and estimated cost (spend per issue), wall-clock latency (bottleneck identification), retry counts and error details; correlate trace data with fix quality by logging issue ID, generated diff, and validation results

### 🐳 Docker Security

Containers run as non-root (`USER claude` in the Dockerfile) but need further hardening:

- **Network isolation** — drop all outbound by default, allowlist GitHub API CIDRs only, block the metadata endpoint (`169.254.169.254`), isolate each job on its own bridge network
- **Resource limits** — `--cpus=1.0 --memory=2g --pids-limit=256`, disable swap, throttle disk I/O
- **Secrets management** — stop passing API keys as env vars; mount as files under `/run/secrets/` or pull from a secrets manager
- **Container auditing** — pipe `docker events` to a log sink, or use Falco for syscall-level monitoring

### 🧪 Test Coverage

All pipeline nodes and routing logic are unit-tested, but there are no integration tests against real LLM responses:

- **End-to-end graph test** — compile the full graph and run it against recorded LLM responses (record once, replay in CI)
- **Polling loop test** — in-memory SQLite, a seed issue, one claim-process-mark cycle with mocked LLM, assert the final row status
- **DB layer tests** — `claimNextIssue`, `markFailed`, `markSuccess` against `:memory:` SQLite (doubles as migration regression coverage)
- **Docker helpers** — `docker/` module has no tests; use `testcontainers` or inject a fake `DockerClient`
- **Nightly E2E job** — run the real pipeline and use a second LLM call to score the output

### ⚙️ Infrastructure & Operations

- **PostgreSQL** — swap SQLite to support multiple workers with `SELECT ... FOR UPDATE SKIP LOCKED` for safe concurrent claiming
- **Webhook endpoint** — listen for `issues.opened`, verify `X-Hub-Signature-256`, dedupe on `X-GitHub-Delivery`, insert into the DB
- **Retry columns** — add `retry_count` and `last_error`; re-claim failed issues up to 3 times with backoff, then mark as dead and alert
- **API resilience** — wrap Anthropic calls with exponential backoff on 429/5xx and a circuit breaker so one API blip doesn't crash the loop
- **Structured logging** — replace `console.log` with `pino` (JSON output, `issueId` + `runId` on every line, ship to a log aggregator)

## 🛠️ Tech Stack

- **Runtime:** Node.js (ESM)
- **Language:** TypeScript (strict mode)
- **AI:** LangGraph + LangChain + Claude (Anthropic)
- **Database:** SQLite via better-sqlite3
- **Containers:** Docker (Dockerode)
- **Build:** Nx + pnpm workspaces
- **Testing:** Vitest
