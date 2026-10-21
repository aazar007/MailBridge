# MailBridge

## Database (Prisma 8)

The app talks to Postgres through Prisma 8 (`@prisma/orm-postgres`), via `lib/db.ts`.

- `prisma.config.ts` — Prisma 8 config; the contract is emitted from `prisma/schema.prisma` into `generated/prisma8` (git-ignored). `npm install` and `npm run build` run `prisma contract emit` automatically.
- `prisma7.config.ts` — the Prisma 7 CLI (`@prisma/prisma7`, binary `prisma7`) still owns migrations in `prisma/migrations` for now. `npm run build` runs `prisma7 migrate deploy`.
- `npm run db:migrate` (dev) / `npm run db:deploy` / `npm run db:verify` / `npm run db:studio`.
- Keep `prisma` (CLI) and `@prisma/orm-postgres` on the matching release-candidate pair (currently `8.0.0-rc.24` + `8.0.0-rc.18`).
- `DateTime` columns are read as UTC strings; use the helpers in `lib/db-time.ts`.
