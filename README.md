# langgraph-fix-issues-pipeline

LangGraph + Nx monorepo with a single-node worker pipeline that calls Claude.

## Quick Start

```bash
pnpm install
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY
pnpm worker:start
```

## Architecture

- **apps/worker** — Node.js worker app that runs a LangGraph pipeline
- **packages/shared** — Shared TypeScript types and LangGraph state definitions

## Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all packages |
| `pnpm worker:dev` | Run worker with hot reload |
| `pnpm worker:build` | Build worker for production |
| `pnpm worker:start` | Run compiled worker |
