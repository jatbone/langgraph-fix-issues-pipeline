# CLAUDE.md

## Project Overview

langgraph-fix-issues-pipeline is a LangGraph + Nx monorepo with a worker app that runs agentic pipelines.

## Monorepo Structure

- **pnpm workspaces** + **Nx** for build orchestration
- `apps/worker` — Node.js worker app with LangGraph agents
- `packages/backend` — Backend package (`@langgraph-fix-issues-pipeline/backend`)

## Build & Dev Commands

```bash
pnpm install              # Install all dependencies
pnpm build                # Build all packages (shared builds first via Nx)
pnpm worker:dev           # Run worker with hot reload
pnpm worker:build         # Build worker for production
pnpm worker:start         # Run compiled worker
```

**Important:** Nx `dev` targets depend on `^build`, so shared packages build automatically before dev starts.

## Architecture

### Worker (`apps/worker`)

- **Entry:** `src/index.ts` — loads env, compiles graph, invokes, logs result
- **Agents:** LangGraph state machines in `src/agents/`
  - `issue-pipeline/` — single node that sends text to Claude and returns response

### Backend Package (`packages/backend`)

- Single export path: `@langgraph-fix-issues-pipeline/backend`
- ESM module system (`"type": "module"`)

## TypeScript

- Strict mode enabled across all packages
- Backend uses `NodeNext` module resolution with `.js` extensions in imports

## Environment Variables

See `.env.example`:
- `ANTHROPIC_API_KEY` — Required for Claude API access

## Code Conventions

- Functional style, no classes
- camelCase for variables/functions, PascalCase for types
- Lowercase hyphenated directory names
- Avoid `any` — use precise types
- Node factory functions: `createXxxNode()` returning async state handlers
- All `.ts` imports use `.js` extensions (ESM + NodeNext)
- Always use `{}` braces for `if`/`else`/`else if` blocks

## Key Patterns

- **State:** `Annotation.Root` with reducers in `packages/backend/src/server.ts`
- **Nodes:** Factory functions in `nodes.ts`, receive full state, return partial update

## Package Manager

pnpm 10.4.0

## Workflow

- **IMPORTANT: Always create a new branch from `devel` before making ANY code changes.** Use the naming convention (`feat/...`, `fix/...`, `chore/...`). Never commit directly to `devel` or `main`.
