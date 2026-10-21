/**
 * campaign-store.ts
 *
 * Single source of truth for the Campaigns architecture, backed by Postgres
 * via Prisma. See lib/token-store.ts for where live Gmail/Outlook tokens
 * live (deliberately kept out of campaign_recipients — see createCampaign()
 * below).
 */

import { or } from '@prisma/orm-postgres/orm-client';
import { db } from '@/lib/db';
import { dbTimestampToIso, toDbTimestamp, toDbTimestampOrNull } from '@/lib/db-time';
import { saveTokens } from '@/lib/token-store';
import { createId } from '@/lib/id';

// ─── Types (unchanged from the Sheets version) ─────────────────────────────────

export type CampaignKind   = 'instant' | 'scheduled';
export type CampaignStatus = 'pending' | 'processing' | 'partial' | 'completed' | 'failed';
export type RecipientStatus = 'pending' | 'scheduled' | 'sent' | 'failed';

export interface Campaign {
  id: string;
  userId: string;
  label: string;
  kind: CampaignKind;
  status: CampaignStatus;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
  totalEmails: number;
  sentCount: number;
  failedCount: number;
  smtpConfigJson: string;
  templateJson: string;
  error?: string;
}

export interface CampaignRecipient {
  id: number;
  campaignId: string;
  email: string;
  recipientJson: string;
  status: RecipientStatus;
  error?: string;
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
}

export interface CampaignAttachment {
  id?: number;
  campaignId: string;
  recipientEmail?: string;
  attachmentId: string;
  filename: string;
  contentType: string;
  storageUrl: string;
  fileSizeBytes: number;
  createdAt: string;
}

export type NewCampaignInput = Omit<Campaign, 'id' | 'createdAt' | 'updatedAt' | 'sentCount' | 'failedCount'>;
export type NewRecipientInput = Omit<CampaignRecipient, 'id' | 'campaignId' | 'createdAt'>;
export type NewAttachmentInput = Omit<CampaignAttachment, 'id' | 'campaignId' | 'createdAt'>;

// ─── Create campaign ──────────────────────────────────────────────────────────

/**
 * Creates a campaign and inserts all recipients + attachment URLs.
 *
 * Recipient contexts sometimes carry a live gmailToken/outlookTokens field
 * (snapshotted at compose time so the cron can send later without a live
 * session). Those never get written to campaign_recipients — they're
 * extracted once per campaign into the token-store, and stripped from
 * recipient_json.
 */
export async function createCampaign(
  input: NewCampaignInput,
  recipients: NewRecipientInput[],
  attachments: NewAttachmentInput[] = [],
): Promise<Campaign> {
  const id  = createId('cmp_');
  const now = new Date().toISOString();

  const campaign: Campaign = {
    ...input,
    id,
    sentCount: 0,
    failedCount: 0,
    totalEmails: recipients.length,
    createdAt: now,
    updatedAt: now,
  };

  let gmailToken: string | undefined;
  let outlookTokens: string | undefined;

  const seenEmails = new Set<string>();
  const sanitizedRecipients = recipients
    .filter((r) => {
      if (seenEmails.has(r.email)) return false; // enforce one row per (campaign, email)
      seenEmails.add(r.email);
      return true;
    })
    .map((r) => {
      try {
        const ctx = JSON.parse(r.recipientJson) as Record<string, unknown>;
        if (typeof ctx.gmailToken === 'string' && !gmailToken) gmailToken = ctx.gmailToken;
        if (typeof ctx.outlookTokens === 'string' && !outlookTokens) outlookTokens = ctx.outlookTokens;
        delete ctx.gmailToken;
        delete ctx.outlookTokens;
        return { ...r, recipientJson: JSON.stringify(ctx) };
      } catch {
        return r;
      }
    });

  if (gmailToken || outlookTokens) {
    await saveTokens(id, { gmailToken, outlookTokens });
  }

  await db.orm.public.Campaign.create({
    id,
    userId: campaign.userId,
    label: campaign.label,
    kind: campaign.kind,
    status: campaign.status,
    scheduledAt: toDbTimestampOrNull(campaign.scheduledAt),
    createdAt: toDbTimestamp(now),
    updatedAt: toDbTimestamp(now),
    totalEmails: campaign.totalEmails,
    sentCount: 0,
    failedCount: 0,
    smtpConfigJson: campaign.smtpConfigJson,
    templateJson: campaign.templateJson,
    error: campaign.error ?? null,
  });

  if (sanitizedRecipients.length) {
    await db.orm.public.CampaignRecipient.createAndCount(
      sanitizedRecipients.map((r) => ({
        campaignId: id,
        email: r.email,
        recipientJson: r.recipientJson,
        status: r.status,
        scheduledAt: toDbTimestampOrNull(r.scheduledAt ?? campaign.scheduledAt),
      })),
    );
  }

  if (attachments.length) {
    await db.orm.public.CampaignAttachment.createAndCount(
      attachments.map((a) => ({
        campaignId: id,
        recipientEmail: a.recipientEmail ?? null,
        attachmentId: a.attachmentId,
        filename: a.filename,
        contentType: a.contentType,
        storageUrl: a.storageUrl,
        fileSizeBytes: a.fileSizeBytes,
      })),
    );
  }

  return campaign;
}

// ─── Campaign queries ─────────────────────────────────────────────────────────

export async function getCampaign(id: string): Promise<Campaign | null> {
  const row = await db.orm.public.Campaign.first({ id });
  return row ? rowToCampaign(row) : null;
}

export async function listCampaigns(userId: string, limit = 100): Promise<Campaign[]> {
  const rows = await db.orm.public.Campaign
    .where({ userId })
    .orderBy((c) => c.createdAt.desc())
    .limit(limit)
    .all();
  return rows.map(rowToCampaign);
}

export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus,
  error?: string,
): Promise<void> {
  await db.orm.public.Campaign
    .where({ id: campaignId })
    .updateAndCount({ status, error: error ?? null, updatedAt: toDbTimestamp(new Date()) });
}

// ─── Recipient queries ────────────────────────────────────────────────────────

/** Pull the next batch of due recipients across ALL campaigns (excluding failed campaigns). */
export async function getDueCampaignRecipients(batchSize = 50): Promise<CampaignRecipient[]> {
  const now = toDbTimestamp(new Date());
  const rows = await db.orm.public.CampaignRecipient
    .where((r) => r.status.in(['pending', 'scheduled']))
    .where((r) => or(r.scheduledAt.isNull(), r.scheduledAt.lte(now)))
    // The campaign must exist and not be failed (campaignId is a required FK).
    .where((r) => r.campaign.some((c) => c.status.neq('failed')))
    .orderBy([(r) => r.scheduledAt.asc(), (r) => r.id.asc()])
    .limit(batchSize)
    .all();

  return rows.map(rowToRecipient);
}

/** Fetch all recipients for a campaign (used for display / retry UI). */
export async function getCampaignRecipients(campaignId: string): Promise<CampaignRecipient[]> {
  const rows = await db.orm.public.CampaignRecipient
    .where({ campaignId })
    .orderBy((r) => r.id.asc())
    .all();
  return rows.map(rowToRecipient);
}

// ─── Batched status + counter updates ─────────────────────────────────────────

export interface RecipientResult {
  recipientId: number;
  campaignId: string;
  status: 'sent' | 'failed';
  error?: string;
}

/**
 * Applies many recipient outcomes in one transaction, then increments each
 * affected campaign's sent_count/failed_count in a second transaction. Call
 * this once per cron tick with every recipient's result, not once per
 * recipient.
 */
export async function applyRecipientResults(results: RecipientResult[]): Promise<void> {
  if (!results.length) return;
  const sentAt = toDbTimestamp(new Date());

  // Two separate transactions on purpose (as before): recipient statuses are
  // committed first, so a failing counter update can never roll back a "sent"
  // status and cause the cron to email the same recipient again.
  await db.transaction(async (tx) => {
    for (const res of results) {
      await tx.orm.public.CampaignRecipient
        .where({ id: res.recipientId })
        .update(
          res.status === 'sent'
            ? { status: 'sent', sentAt, error: null }
            : { status: 'failed', error: res.error ?? null },
        );
    }
  });

  const deltas = new Map<string, { sent: number; failed: number }>();
  for (const res of results) {
    const d = deltas.get(res.campaignId) ?? { sent: 0, failed: 0 };
    if (res.status === 'sent') d.sent++; else d.failed++;
    deltas.set(res.campaignId, d);
  }

  // Atomic counter bumps. The Prisma 8 ORM has no `increment`, so this goes
  // through the raw-SQL lane; updated_at is bumped as the old @updatedAt did.
  await db.transaction(async (tx) => {
    for (const [campaignId, delta] of deltas) {
      await tx.execute(
        db.raw.sql`
          UPDATE campaigns
          SET sent_count = sent_count + ${delta.sent},
              failed_count = failed_count + ${delta.failed},
              updated_at = (now() AT TIME ZONE 'UTC')
          WHERE id = ${campaignId}
        `.affectedCount().build(),
      );
    }
  });
}

/** Single-recipient convenience wrapper around applyRecipientResults(). */
export async function markRecipientSent(recipientId: number, campaignId: string): Promise<void> {
  await applyRecipientResults([{ recipientId, campaignId, status: 'sent' }]);
}

/** Single-recipient convenience wrapper around applyRecipientResults(). */
export async function markRecipientFailed(
  recipientId: number,
  campaignId: string,
  error: string,
): Promise<void> {
  await applyRecipientResults([{ recipientId, campaignId, status: 'failed', error }]);
}

/**
 * Batched replacement for the old per-recipient reconcileCampaignStatus().
 * Call once per tick with every campaignId touched during that tick.
 */
export async function reconcileCampaignStatuses(campaignIds: string[]): Promise<void> {
  const uniqueIds = [...new Set(campaignIds)];
  if (!uniqueIds.length) return;

  const now = toDbTimestamp(new Date());

  for (const campaignId of uniqueIds) {
    const campaign = await db.orm.public.Campaign.first({ id: campaignId });
    if (!campaign) continue;

    const [total, pending, failed] = await Promise.all([
      db.orm.public.CampaignRecipient.where({ campaignId }).aggregate((a) => ({ n: a.count() })),
      db.orm.public.CampaignRecipient
        .where({ campaignId })
        .where((r) => r.status.in(['pending', 'scheduled']))
        .aggregate((a) => ({ n: a.count() })),
      db.orm.public.CampaignRecipient
        .where({ campaignId, status: 'failed' })
        .aggregate((a) => ({ n: a.count() })),
    ]);
    if (total.n === 0) continue;
    if (pending.n > 0) continue; // still in progress

    const status: CampaignStatus = failed.n === total.n ? 'failed' : 'completed';
    if (campaign.status === status) continue;

    await db.orm.public.Campaign.where({ id: campaignId }).update({ status, updatedAt: now });
  }
}

// ─── Attachment queries ───────────────────────────────────────────────────────

export async function getAttachmentsForRecipient(
  campaignId: string,
  recipientEmail: string,
): Promise<CampaignAttachment[]> {
  const rows = await db.orm.public.CampaignAttachment
    .where({ campaignId })
    .where((a) => or(a.recipientEmail.isNull(), a.recipientEmail.eq(recipientEmail)))
    .all();
  return rows.map(rowToAttachment);
}

// ─── Cleanup (called by daily cron) ──────────────────────────────────────────

export interface CleanupResult {
  deletedSentRecipients: number;
  deletedFailedRecipients: number;
  deletedStaleCampaigns: number;
  deletedOrphanAttachments: number;
}

/**
 * Retention policy (same as before):
 *   - `sent` rows older than 24 hours → DELETE (stats survive in campaigns.sent_count)
 *   - `failed` rows older than 30 days → DELETE
 *   - Campaigns with no remaining recipients AND older than 7 days → DELETE
 *   - Attachment URL rows for deleted campaigns → CASCADE DELETE
 * Runs once/day.
 */
export async function runDailyCleanup(): Promise<CleanupResult> {
  const cutoff24h = toDbTimestamp(Date.now() - 24 * 60 * 60 * 1000);
  const cutoff30d = toDbTimestamp(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const cutoff7d  = toDbTimestamp(Date.now() -  7 * 24 * 60 * 60 * 1000);

  const sentStale = await db.orm.public.CampaignRecipient
    .where({ status: 'sent' })
    .where((r) => r.sentAt.lt(cutoff24h))
    .deleteAndCount();
  const failedStale = await db.orm.public.CampaignRecipient
    .where((r) => r.status.in(['failed', 'error']))
    .where((r) => r.createdAt.lt(cutoff30d))
    .deleteAndCount();

  const remainingCampaignIds = new Set(
    (await db.orm.public.CampaignRecipient.select('campaignId').distinct('campaignId').all())
      .map((r) => r.campaignId),
  );
  const candidateStaleCampaigns = await db.orm.public.Campaign
    .where((c) => c.status.in(['completed', 'failed']))
    .where((c) => c.updatedAt.lt(cutoff7d))
    .all();
  const staleCampaigns = candidateStaleCampaigns.filter((c) => !remainingCampaignIds.has(c.id));
  if (staleCampaigns.length) {
    await db.orm.public.Campaign.where((c) => c.id.in(staleCampaigns.map((s) => s.id))).deleteAndCount();
  }

  const remainingCampaignIdsAfterDelete = new Set(
    (await db.orm.public.Campaign.select('id').all()).map((c) => c.id),
  );
  const attachmentRows = await db.orm.public.CampaignAttachment.select('id', 'campaignId').all();
  const orphanAttachmentIds = attachmentRows
    .filter((r) => !remainingCampaignIdsAfterDelete.has(r.campaignId))
    .map((r) => r.id);
  if (orphanAttachmentIds.length) {
    await db.orm.public.CampaignAttachment.where((a) => a.id.in(orphanAttachmentIds)).deleteAndCount();
  }

  return {
    deletedSentRecipients: sentStale,
    deletedFailedRecipients: failedStale,
    deletedStaleCampaigns: staleCampaigns.length,
    deletedOrphanAttachments: orphanAttachmentIds.length,
  };
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

// Timestamp columns arrive as strings from the Prisma 8 client (see lib/db-time.ts).
function rowToCampaign(row: {
  id: string; userId: string; label: string; kind: string; status: string;
  scheduledAt: string | null; createdAt: string; updatedAt: string; totalEmails: number;
  sentCount: number; failedCount: number; smtpConfigJson: string; templateJson: string; error: string | null;
}): Campaign {
  return {
    id: row.id,
    userId: row.userId,
    label: row.label,
    kind: row.kind as CampaignKind,
    status: row.status as CampaignStatus,
    scheduledAt: row.scheduledAt ? dbTimestampToIso(row.scheduledAt) : undefined,
    createdAt: dbTimestampToIso(row.createdAt),
    updatedAt: dbTimestampToIso(row.updatedAt),
    totalEmails: row.totalEmails,
    sentCount: row.sentCount,
    failedCount: row.failedCount,
    smtpConfigJson: row.smtpConfigJson,
    templateJson: row.templateJson,
    error: row.error ?? undefined,
  };
}

function rowToRecipient(row: {
  id: number; campaignId: string; email: string; recipientJson: string; status: string;
  error: string | null; scheduledAt: string | null; sentAt: string | null; createdAt: string;
}): CampaignRecipient {
  return {
    id: row.id,
    campaignId: row.campaignId,
    email: row.email,
    recipientJson: row.recipientJson,
    status: row.status as RecipientStatus,
    scheduledAt: row.scheduledAt ? dbTimestampToIso(row.scheduledAt) : undefined,
    error: row.error ?? undefined,
    sentAt: row.sentAt ? dbTimestampToIso(row.sentAt) : undefined,
    createdAt: dbTimestampToIso(row.createdAt),
  };
}

function rowToAttachment(row: {
  id: number; campaignId: string; recipientEmail: string | null; attachmentId: string;
  filename: string; contentType: string; storageUrl: string; fileSizeBytes: number; createdAt: string;
}): CampaignAttachment {
  return {
    id: row.id,
    campaignId: row.campaignId,
    recipientEmail: row.recipientEmail ?? undefined,
    attachmentId: row.attachmentId,
    filename: row.filename,
    contentType: row.contentType,
    storageUrl: row.storageUrl,
    fileSizeBytes: row.fileSizeBytes,
    createdAt: dbTimestampToIso(row.createdAt),
  };
}
