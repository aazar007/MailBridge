/**
 * lib/token-store.ts
 *
 * جدول صغير على Turso مخصص فقط لرموز OAuth الحية (Gmail/Outlook). هذه الرموز
 * تُبقيها بعيداً عن Google Sheet عمداً — أي شخص لديه وصول للشيت يمكنه استخدامها
 * لإرسال بريد باسم الحساب المتصل لو وُضعت هناك كنص عادي.
 *
 * مفتاح الصف هو job_id (للإرسال المجدول القديم) أو campaign_id (للحملات).
 */

import { ensureSchema, getDb, tursoConfigured } from '@/lib/db';

export interface TokenPair {
  gmailToken?: string;
  outlookTokens?: string;
}

const memoryTokens = new Map<string, TokenPair>();

export async function saveTokens(key: string, tokens: TokenPair): Promise<void> {
  if (!tokens.gmailToken && !tokens.outlookTokens) return;

  if (!tursoConfigured()) {
    memoryTokens.set(key, tokens);
    return;
  }

  await ensureSchema();
  await getDb().execute({
    sql: `
      INSERT INTO send_tokens (id, gmail_token, outlook_tokens)
      VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        gmail_token = excluded.gmail_token,
        outlook_tokens = excluded.outlook_tokens
    `,
    args: [key, tokens.gmailToken ?? null, tokens.outlookTokens ?? null],
  });
}

export async function getTokens(key: string): Promise<TokenPair> {
  if (!tursoConfigured()) {
    return memoryTokens.get(key) ?? {};
  }

  await ensureSchema();
  const result = await getDb().execute({
    sql: 'SELECT gmail_token, outlook_tokens FROM send_tokens WHERE id = ?',
    args: [key],
  });
  const row = result.rows[0];
  if (!row) return {};
  return {
    gmailToken: (row.gmail_token as string | null) ?? undefined,
    outlookTokens: (row.outlook_tokens as string | null) ?? undefined,
  };
}

export async function deleteTokens(key: string): Promise<void> {
  if (!tursoConfigured()) {
    memoryTokens.delete(key);
    return;
  }
  await ensureSchema();
  await getDb().execute({ sql: 'DELETE FROM send_tokens WHERE id = ?', args: [key] });
}
