# Known Gotchas

## `gh` CLI stderr

`gh` sends errors and warnings to stderr. When spawning `gh` processes, always capture stderr:
```ts
const result = execSync(cmd, { stdio: ['pipe', 'pipe', 'pipe'] });
```
Otherwise errors are swallowed silently.

## Data directory resolution

The CLI resolves `data/` relative to the **package root** (not `process.cwd()`). If you need a custom location, respect the `GOGETAJOB_DATA` environment variable.

## Migration idempotency

DB migrations run on every CLI invocation. Every migration statement must be idempotent:
```sql
CREATE TABLE IF NOT EXISTS ...
ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...
```

## GitHub API rate limits

`gh` respects rate limits, but scanning hundreds of repos in one `scan` invocation can still hit them. Don't add unbounded loops over repos or issues. The scan command already has pagination limits — respect them.

## Build before commit

Pre-commit hook runs `npm run build`. If TypeScript doesn't compile, the commit is rejected. Always run `npm run build` locally before committing.

## No test runner configured

There's no `npm test` script yet. Tests exist in `tests/cli/` but aren't wired up. If you add tests, also add the test script to `package.json`.

## index.ts is large

`src/cli/index.ts` is 1,600+ lines. It's being refactored — individual commands are moving to `src/cli/commands/`. When adding new commands, create a new file in `commands/` rather than adding to `index.ts`.
