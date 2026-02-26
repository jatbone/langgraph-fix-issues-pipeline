# langgraph-fix-issues-pipeline

LangGraph + Nx monorepo with a single-node CLI pipeline that calls Claude.

## Quick Start

```bash
pnpm install
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY
pnpm cli:start
```

## Architecture

- **apps/cli** — Node.js CLI app that runs a LangGraph pipeline
- **packages/shared** — Shared TypeScript types and LangGraph state definitions

## Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install all dependencies |
| `pnpm build` | Build all packages |
| `pnpm cli:dev` | Run CLI with hot reload |
| `pnpm cli:build` | Build CLI for production |
| `pnpm cli:start` | Run compiled CLI |
