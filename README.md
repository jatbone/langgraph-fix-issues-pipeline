# langgraph-fix-issues-pipeline

LangGraph + Nx monorepo with a polling worker that processes issues from a SQLite database through an agentic pipeline.

## Quick Start

```bash
pnpm install
cp .env.example .env
# Edit .env with your API keys
pnpm db:migrate       # Create the database and tables
pnpm worker:dev       # Start the polling worker
```

## Architecture

- **apps/worker** — Node.js worker app that polls a SQLite database for issues and runs each through a LangGraph pipeline
- **packages/shared** — Shared TypeScript types and LangGraph state definitions

### Polling Loop

The worker runs a continuous loop:
1. Claims the next open issue from SQLite (atomic `UPDATE ... RETURNING`)
2. Spins up a Docker container with the target repo cloned
3. Runs the issue pipeline (intake → plan → code → review → integrate)
4. Updates the issue status to `success` or `failed` in the database
5. Cleans up the Docker container
6. Sleeps `POLL_INTERVAL_MS` before the next iteration

Each pipeline run has a configurable timeout (`PIPELINE_TIMEOUT_MS`). On timeout, the container is cleaned up and the issue is marked as failed.

### Graceful Shutdown

Send `SIGINT` (Ctrl+C) or `SIGTERM` to stop the worker. It finishes the current iteration before exiting.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all packages |
| `pnpm worker:dev` | Run worker with hot reload |
| `pnpm worker:build` | Build worker for production |
| `pnpm worker:start` | Run compiled worker |
| `pnpm db:migrate` | Create/update database tables |
| `pnpm db:insert` | Insert a hardcoded test issue |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Required. Claude API key |
| `ANTHROPIC_MODEL` | `sonnet` | Claude model to use |
| `GITHUB_TOKEN` | — | Required. GitHub access token |
| `GITHUB_REPO` | — | Required. Target repo (`owner/repo`) |
| `BASE_BRANCH` | `devel` | Branch to clone and base PRs on |
| `IS_DEBUG` | `false` | Enable verbose logging |
| `DATABASE_PATH` | `./data/issues.db` | Path to the SQLite database file |
| `POLL_INTERVAL_MS` | `10000` | Milliseconds between poll iterations |
| `PIPELINE_TIMEOUT_MS` | `600000` | Max milliseconds per pipeline run (10 min) |
