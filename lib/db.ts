import { createClient, type Client } from '@libsql/client/web';

/**
 * lib/db.ts
 *
 * Turso يستضيف فقط رموز OAuth الحية (send_tokens).
 * كل شيء آخر — بما فيها المرفقات — يعيش في Google Sheets
 * (lib/sheetsClient.ts / lib/scheduled-attachments.ts).
 */

let client: Client | null = null;
let schemaReady: Promise<void> | null = null;

export function tursoConfigured(): boolean {
  return !!(process.env.TURSO_DATABASE_URL?.trim() && process.env.TURSO_AUTH_TOKEN?.trim());
}

function tursoUrl(): string {
  const raw = process.env.TURSO_DATABASE_URL!.trim();
  if (raw.startsWith('libsql://')) {
    return raw.replace('libsql://', 'https://');
  }
  return raw;
}

export function getDb(): Client {
  if (!tursoConfigured()) {
    throw new Error('Turso is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.');
  }
  if (!client) {
    client = createClient({
      url: tursoUrl(),
      authToken: process.env.TURSO_AUTH_TOKEN!.trim(),
    });
  }
  return client;
}

async function runSchemaStatement(sql: string): Promise<void> {
  try {
    await getDb().execute(sql);
  } catch (err) {
    console.error('Turso schema statement failed:', err);
  }
}

export async function ensureSchema(): Promise<void> {
  if (!tursoConfigured()) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      // رموز OAuth حية (Gmail/Outlook) — مفتاحها job_id أو campaign_id.
      // تبقى هنا عمداً بدل Sheets حتى لا تُقرأ من أي شخص لديه وصول للشيت.
      await runSchemaStatement(`
        CREATE TABLE IF NOT EXISTS send_tokens (
          id TEXT PRIMARY KEY,
          gmail_token TEXT,
          outlook_tokens TEXT
        )
      `);
    })();
  }
  await schemaReady;
}
