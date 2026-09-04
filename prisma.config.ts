import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// Mirror Next.js's env file precedence so `prisma` CLI commands see the
// same DATABASE_URL as `next dev`/`next build`.
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Direct (non-pooled) connection — migrations/introspection need session
    // continuity that the pooler (DATABASE_URL, used by lib/prisma.ts at
    // runtime) doesn't provide.
    url: env('DIRECT_URL'),
  },
});
