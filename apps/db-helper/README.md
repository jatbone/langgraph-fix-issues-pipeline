# db-helper

CLI scripts for managing the SQLite issues database. Uses the DB layer from `@langgraph-fix-issues-pipeline/backend`.

## Commands

Run from the monorepo root:

| Command | Description |
|---------|-------------|
| `pnpm db:migrate` | Create/update the `issues` table |
| `pnpm db:insert` | Insert a hardcoded test issue |

Or run directly from this directory:

```bash
pnpm migrate
pnpm insert
```

## Adding Issues

> **Important:** `pnpm db:insert` reads the issue `title` and `body` directly from `src/insert.ts`. You **must** edit these values before running the command — there is no CLI prompt or other input method.

## Database Location

The database is created at `<monorepo-root>/data/issues.db` by default. Override with the `DATABASE_PATH` environment variable.
