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

Edit `src/insert.ts` to change the hardcoded `title` and `body` values before running `pnpm db:insert`.

## Database Location

The database is created at `<monorepo-root>/data/issues.db` by default. Override with the `DATABASE_PATH` environment variable.
