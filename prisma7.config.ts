import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from '@prisma/prisma7/config';

// Prisma 7 CLI config (`prisma7 ...`). Prisma 7 still plans and applies the
// schema migrations in prisma/migrations; the Prisma 8 CLI (`prisma ...`) reads
// prisma.config.ts and owns contract emit / db sign / db verify.
//
// Mirror Next.js's env file precedence so CLI commands see the same
// DATABASE_URL as `next dev`/`next build`.
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Direct (non-pooled) connection — migrations/introspection need session
    // continuity that the pooler (DATABASE_URL, used by lib/db.ts at
    // runtime) doesn't provide.
    url: env('DIRECT_URL'),
  },
});
