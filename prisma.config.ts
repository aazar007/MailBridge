import { config as loadEnv } from 'dotenv';
import { definePrismaConfig } from 'prisma/config';
import { defineConfig as ormConfig, prisma7Schema } from '@prisma/orm-postgres/config';

// Prisma 8 CLI config (`prisma ...`). The contract is read straight from the
// existing prisma/schema.prisma, so there is a single schema file while
// Prisma 7 (`prisma7 migrate ...`) still owns migrations.
//
// Mirror Next.js's env file precedence so CLI commands see the same
// DATABASE_URL as `next dev`/`next build`.
loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

export default definePrismaConfig({
  orm: ormConfig({
    contract: prisma7Schema('prisma/schema.prisma'),
    // Emitted contract.json / contract.d.ts (gitignored via `generated/`).
    output: 'generated/prisma8',
    db: {
      // Direct (non-pooled) connection for db sign / db verify. `contract emit`
      // never connects, so this may be unset during builds that only emit.
      connection: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
    },
  }),
});
