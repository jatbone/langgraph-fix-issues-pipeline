# CLAUDE.md

## Project Overview

langgraph-fix-issues-pipeline is a LangGraph + Nx monorepo with a worker app that runs agentic pipelines.

## Monorepo Structure

- **pnpm workspaces** + **Nx** for build orchestration
- `apps/worker` — Node.js worker app with LangGraph agents
- `packages/shared` — Shared TypeScript types (`@langgraph-fix-issues-pipeline/shared`)

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

### Shared Package (`packages/shared`)

- Two export paths: `@langgraph-fix-issues-pipeline/shared` (client-safe types) and `@langgraph-fix-issues-pipeline/shared/server` (LangGraph state — backend only)
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

## Key Patterns

- **State:** `Annotation.Root` with reducers in `packages/shared/src/server.ts`
- **Nodes:** Factory functions in `nodes.ts`, receive full state, return partial update

## Package Manager

pnpm 10.4.0
