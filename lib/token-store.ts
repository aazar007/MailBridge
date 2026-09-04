/**
 * lib/token-store.ts
 *
 * Live Gmail/Outlook OAuth tokens, keyed by job_id (legacy scheduled sends)
 * or campaign_id (campaigns). Stored in the `send_tokens` table.
 */

import { prisma, dbConfigured } from '@/lib/prisma';

export interface TokenPair {
  gmailToken?: string;
  outlookTokens?: string;
}

const memoryTokens = new Map<string, TokenPair>();

export async function saveTokens(key: string, tokens: TokenPair): Promise<void> {
  if (!tokens.gmailToken && !tokens.outlookTokens) return;

  if (!dbConfigured()) {
    memoryTokens.set(key, tokens);
    return;
  }

  await prisma.sendToken.upsert({
    where: { id: key },
    create: { id: key, gmailToken: tokens.gmailToken ?? null, outlookTokens: tokens.outlookTokens ?? null },
    update: { gmailToken: tokens.gmailToken ?? null, outlookTokens: tokens.outlookTokens ?? null },
  });
}

export async function getTokens(key: string): Promise<TokenPair> {
  if (!dbConfigured()) {
    return memoryTokens.get(key) ?? {};
  }

  const row = await prisma.sendToken.findUnique({ where: { id: key } });
  if (!row) return {};
  return {
    gmailToken: row.gmailToken ?? undefined,
    outlookTokens: row.outlookTokens ?? undefined,
  };
}

export async function deleteTokens(key: string): Promise<void> {
  if (!dbConfigured()) {
    memoryTokens.delete(key);
    return;
  }
  await prisma.sendToken.deleteMany({ where: { id: key } });
}
