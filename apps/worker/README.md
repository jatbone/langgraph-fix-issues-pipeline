# worker

Polling worker that claims issues from a SQLite database and runs each through a LangGraph agentic pipeline. For each issue it spins up an isolated Docker container with the target repo, executes the pipeline (intake, plan, code, review, integrate), and opens a PR.

## Running

From the monorepo root:

```bash
pnpm worker:dev    # Development with hot reload
pnpm worker:build  # Compile TypeScript
pnpm worker:start  # Run compiled output
```

Or directly from this directory:

```bash
pnpm dev
pnpm build
pnpm start
```

## Architecture

```
src/
├── index.ts                    # Entry point — polling loop, graceful shutdown
├── agents/
│   └── issue-pipeline/
│       ├── graph.ts            # LangGraph graph definition (nodes + edges)
│       ├── routing.ts          # Conditional edge routing logic
│       ├── constants.ts        # Retry limits, node names
│       ├── contracts.ts        # Type definitions
│       ├── format-input-node.ts
│       ├── issue-intake-node.ts
│       ├── plan-node.ts
│       ├── coder-node.ts
│       ├── review-node.ts
│       ├── integrator-node.ts
│       ├── log-and-notify-node.ts
│       ├── logger.ts
│       ├── utils.ts
│       └── __tests__/          # Unit tests for all nodes and routing
├── db/
│   └── index.ts                # SQLite database interface
└── docker/
    ├── client.ts               # Dockerode wrapper
    ├── build-image.ts          # Docker image build logic
    └── index.ts
```

## Pipeline Nodes

Each node is a factory function (`createXxxNode()`) that receives the full graph state and returns a partial state update.

| Node | Model | Description |
|------|-------|-------------|
| `format_input` | fast | Validates and normalises raw issue input |
| `issue_intake` | fast | Parses issue into structured title, body, labels |
| `plan_generation` | full | Analyses the codebase and produces a step-by-step fix plan |
| `code_implementation` | full | Implements the plan by writing code in the Docker container |
| `code_review` | full | Reviews the diff and approves or requests changes |
| `integrate` | fast | Commits, pushes, and opens a PR |
| `log_and_notify` | — | Logs the pipeline result and updates the DB |

**fast** = `ANTHROPIC_FAST_MODEL` (default Haiku), **full** = `ANTHROPIC_MODEL` (default Sonnet).

## Testing

```bash
pnpm test         # Run once
pnpm test:watch   # Watch mode
```

All external dependencies (Docker, Claude API) are fully mocked.

## Configuration

All environment variables are defined in `.env` at the monorepo root. See the [root README](../../README.md#-environment-variables) for setup instructions.

| Variable | Default | Description |
|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | — | Required. Claude API key |
| `ANTHROPIC_MODEL` | `sonnet` | Model for heavy nodes (planning, coding, review) |
| `ANTHROPIC_FAST_MODEL` | `haiku` | Model for lightweight nodes (formatting, intake, integration) |
| `GITHUB_TOKEN` | — | Required. GitHub PAT with `repo` scope |
| `GITHUB_REPO` | — | Required. Target repo (`owner/repo`) |
| `BASE_BRANCH` | `devel` | Branch to clone and base PRs on |
| `IS_DEBUG` | `false` | Enable verbose logging |
| `DATABASE_PATH` | `./data/issues.db` | Path to the SQLite database file |
| `POLL_INTERVAL_MS` | `10000` | Milliseconds between poll iterations |
| `PIPELINE_TIMEOUT_MS` | `600000` | Max time per pipeline run (10 min) |
