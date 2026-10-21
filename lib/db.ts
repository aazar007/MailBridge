import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from '@/generated/prisma8/contract.d';
import contractJson from '@/generated/prisma8/contract.json' with { type: 'json' };

// Prisma 8 client. `generated/prisma8` is produced by `prisma contract emit`
// (see the `postinstall` / `build` scripts) and is gitignored.
//
// The factory connects lazily (on the first query), so constructing it with no
// DATABASE_URL is fine — dbConfigured() below gates the DB code paths.

type Db = ReturnType<typeof createClient>;

const globalForDb = globalThis as unknown as { db?: Db };

function createClient() {
  return postgres<Contract>({
    contractJson,
    url: process.env.DATABASE_URL,
  });
}

// Reuse one client (one pg.Pool) across Next.js dev hot reloads.
export const db = globalForDb.db ?? createClient();

if (process.env.NODE_ENV !== 'production') globalForDb.db = db;

export function dbConfigured(): boolean {
  return !!process.env.DATABASE_URL?.trim();
}
