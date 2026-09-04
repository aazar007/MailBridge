/**
 * campaign-store.ts
 *
 * Single source of truth for the Campaigns architecture — now backed by
 * Google Sheets instead of Turso. See lib/sheetsClient.ts for the low-level
 * tab I/O and lib/token-store.ts for where live Gmail/Outlook tokens live
 * (deliberately NOT in the Sheet — see createCampaign() below).
 *
 * Rate-limit note: Sheets has no SQL batch()/transaction primitive, so the
 * hot path (process-scheduled cron) must NOT call markRecipientSent/Failed
 * once per recipient — that reintroduces the "100+ API calls per tick"
 * problem. Use applyRecipientResults() to write all of a tick's outcomes in
 * one batched call, and reconcileCampaignStatuses() to update affected
 * campaigns' status in a second batched call.
 */

import * as sheets from '@/lib/sheetsClient';
import { saveTokens } from '@/lib/token-store';
import { createId } from '@/lib/id';

// ─── Types (unchanged from the Turso version) ─────────────────────────────────

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

const CAMPAIGNS_TAB = 'campaigns';
const RECIPIENTS_TAB = 'campaign_recipients';
const ATTACHMENTS_TAB = 'campaign_attachments';

// ─── Create campaign ──────────────────────────────────────────────────────────

/**
 * Creates a campaign and inserts all recipients + attachment URLs.
 *
 * Recipient contexts sometimes carry a live gmailToken/outlookTokens field
 * (snapshotted at compose time so the cron can send later without a live
 * session). Those never get written to the Sheet — they're extracted once
 * per campaign into the Turso token-store, and stripped from recipient_json.
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
      if (seenEmails.has(r.email)) return false; // Sheets has no UNIQUE(campaign_id, email)
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

  await sheets.appendRow(CAMPAIGNS_TAB, {
    id,
    user_id: campaign.userId,
    label: campaign.label,
    kind: campaign.kind,
    status: campaign.status,
    scheduled_at: campaign.scheduledAt ?? '',
    created_at: now,
    updated_at: now,
    total_emails: campaign.totalEmails,
    sent_count: 0,
    failed_count: 0,
    smtp_config_json: campaign.smtpConfigJson,
    template_json: campaign.templateJson,
    error: campaign.error ?? '',
  });

  if (sanitizedRecipients.length) {
    let nextId = await sheets.nextId(RECIPIENTS_TAB);
    await sheets.appendRows(
      RECIPIENTS_TAB,
      sanitizedRecipients.map((r) => ({
        id: nextId++,
        campaign_id: id,
        email: r.email,
        recipient_json: r.recipientJson,
        status: r.status,
        error: '',
        scheduled_at: r.scheduledAt ?? campaign.scheduledAt ?? '',
        sent_at: '',
        created_at: now,
      })),
    );
  }

  if (attachments.length) {
    let nextId = await sheets.nextId(ATTACHMENTS_TAB);
    await sheets.appendRows(
      ATTACHMENTS_TAB,
      attachments.map((a) => ({
        id: nextId++,
        campaign_id: id,
        recipient_email: a.recipientEmail ?? '',
        attachment_id: a.attachmentId,
        filename: a.filename,
        content_type: a.contentType,
        storage_url: a.storageUrl,
        file_size_bytes: a.fileSizeBytes,
        created_at: now,
      })),
    );
  }

  return campaign;
}

// ─── Campaign queries ─────────────────────────────────────────────────────────

export async function getCampaign(id: string): Promise<Campaign | null> {
  const rows = await sheets.getRows(CAMPAIGNS_TAB);
  const row = rows.find((r) => String(r.id) === id);
  return row ? rowToCampaign(row) : null;
}

export async function listCampaigns(userId: string, limit = 100): Promise<Campaign[]> {
  const rows = await sheets.getRows(CAMPAIGNS_TAB);
  return rows
    .filter((r) => r.user_id === userId)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit)
    .map(rowToCampaign);
}

export async function updateCampaignStatus(
  campaignId: string,
  status: CampaignStatus,
  error?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const rows = await sheets.getRows(CAMPAIGNS_TAB);
  const row = rows.find((r) => String(r.id) === campaignId);
  if (!row) return;
  await sheets.updateRow(CAMPAIGNS_TAB, row._row, { ...row, status, error: error ?? '', updated_at: now });
}

// ─── Recipient queries ────────────────────────────────────────────────────────

/**
 * Pull the next batch of due recipients across ALL campaigns.
 * No SQL JOIN in Sheets — reads both tabs and joins in memory.
 */
export async function getDueCampaignRecipients(batchSize = 50): Promise<CampaignRecipient[]> {
  const now = new Date().toISOString();
  const [recipientRows, campaignRows] = await Promise.all([
    sheets.getRows(RECIPIENTS_TAB),
    sheets.getRows(CAMPAIGNS_TAB),
  ]);
  const campaignStatusById = new Map(campaignRows.map((c) => [String(c.id), String(c.status)]));

  const due = recipientRows
    .filter((r) => {
      const status = String(r.status);
      if (status !== 'pending' && status !== 'scheduled') return false;
      const scheduledAt = r.scheduled_at ? String(r.scheduled_at) : '';
      if (scheduledAt && scheduledAt > now) return false;
      return campaignStatusById.get(String(r.campaign_id)) !== 'failed';
    })
    .sort((a, b) => {
      const aSched = String(a.scheduled_at ?? '');
      const bSched = String(b.scheduled_at ?? '');
      if (aSched !== bSched) return aSched.localeCompare(bSched);
      return Number(a.id) - Number(b.id);
    })
    .slice(0, batchSize);

  return due.map(rowToRecipient);
}

/** Fetch all recipients for a campaign (used for display / retry UI). */
export async function getCampaignRecipients(campaignId: string): Promise<CampaignRecipient[]> {
  const rows = await sheets.getRows(RECIPIENTS_TAB);
  return rows
    .filter((r) => String(r.campaign_id) === campaignId)
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map(rowToRecipient);
}

// ─── Batched status + counter updates ─────────────────────────────────────────

export interface RecipientResult {
  recipientId: number;
  campaignId: string;
  status: 'sent' | 'failed';
  error?: string;
}

/**
 * Applies many recipient outcomes in ONE Sheets write, then increments each
 * affected campaign's sent_count/failed_count in a SECOND batched write.
 * This is the hot-path primitive — call it once per cron tick with every
 * recipient's result, not once per recipient.
 */
export async function applyRecipientResults(results: RecipientResult[]): Promise<void> {
  if (!results.length) return;
  const now = new Date().toISOString();

  const recipientRows = await sheets.getRows(RECIPIENTS_TAB);
  const byId = new Map(recipientRows.map((r) => [Number(r.id), r]));

  const recipientUpdates: sheets.RowUpdate[] = [];
  for (const res of results) {
    const row = byId.get(res.recipientId);
    if (!row) continue;
    recipientUpdates.push({
      row: row._row,
      obj: res.status === 'sent'
        ? { ...row, status: 'sent', sent_at: now, error: '' }
        : { ...row, status: 'failed', error: res.error ?? '' },
    });
  }
  if (recipientUpdates.length) {
    await sheets.batchUpdateRows(RECIPIENTS_TAB, recipientUpdates);
  }

  const deltas = new Map<string, { sent: number; failed: number }>();
  for (const res of results) {
    const d = deltas.get(res.campaignId) ?? { sent: 0, failed: 0 };
    if (res.status === 'sent') d.sent++; else d.failed++;
    deltas.set(res.campaignId, d);
  }

  const campaignRows = await sheets.getRows(CAMPAIGNS_TAB);
  const campaignUpdates: sheets.RowUpdate[] = [];
  for (const [campaignId, delta] of deltas) {
    const row = campaignRows.find((r) => String(r.id) === campaignId);
    if (!row) continue;
    campaignUpdates.push({
      row: row._row,
      obj: {
        ...row,
        sent_count: Number(row.sent_count ?? 0) + delta.sent,
        failed_count: Number(row.failed_count ?? 0) + delta.failed,
        updated_at: now,
      },
    });
  }
  if (campaignUpdates.length) {
    await sheets.batchUpdateRows(CAMPAIGNS_TAB, campaignUpdates);
  }
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

  const [recipientRows, campaignRows] = await Promise.all([
    sheets.getRows(RECIPIENTS_TAB),
    sheets.getRows(CAMPAIGNS_TAB),
  ]);

  const now = new Date().toISOString();
  const updates: sheets.RowUpdate[] = [];

  for (const campaignId of uniqueIds) {
    const campaignRow = campaignRows.find((r) => String(r.id) === campaignId);
    if (!campaignRow) continue;

    const recipients = recipientRows.filter((r) => String(r.campaign_id) === campaignId);
    const total = recipients.length;
    if (total === 0) continue;
    const pending = recipients.filter((r) => r.status === 'pending' || r.status === 'scheduled').length;
    if (pending > 0) continue; // still in progress

    const failed = recipients.filter((r) => r.status === 'failed').length;
    const status: CampaignStatus = failed === total ? 'failed' : 'completed';
    if (campaignRow.status === status) continue;

    updates.push({ row: campaignRow._row, obj: { ...campaignRow, status, updated_at: now } });
  }

  if (updates.length) await sheets.batchUpdateRows(CAMPAIGNS_TAB, updates);
}

// ─── Attachment queries ───────────────────────────────────────────────────────

export async function getAttachmentsForRecipient(
  campaignId: string,
  recipientEmail: string,
): Promise<CampaignAttachment[]> {
  const rows = await sheets.getRows(ATTACHMENTS_TAB);
  return rows
    .filter((r) => String(r.campaign_id) === campaignId && (!r.recipient_email || r.recipient_email === recipientEmail))
    .map(rowToAttachment);
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
 * Runs once/day — the extra re-reads here (vs. a single SQL statement) are fine.
 */
export async function runDailyCleanup(): Promise<CleanupResult> {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff30d  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff7d   = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();

  const recipientRows = await sheets.getRows(RECIPIENTS_TAB);
  const sentStale = recipientRows.filter((r) => r.status === 'sent' && r.sent_at && String(r.sent_at) < cutoff24h);
  const failedStale = recipientRows.filter(
    (r) => (r.status === 'failed' || r.status === 'error') && String(r.created_at) < cutoff30d,
  );
  const toDelete = [...sentStale, ...failedStale];
  if (toDelete.length) {
    await sheets.deleteRows(RECIPIENTS_TAB, toDelete.map((r) => r._row));
  }

  const remainingCampaignIds = new Set(
    (await sheets.getRows(RECIPIENTS_TAB)).map((r) => String(r.campaign_id)),
  );
  const campaignRows = await sheets.getRows(CAMPAIGNS_TAB);
  const staleCampaigns = campaignRows.filter(
    (r) =>
      (r.status === 'completed' || r.status === 'failed') &&
      String(r.updated_at) < cutoff7d &&
      !remainingCampaignIds.has(String(r.id)),
  );
  if (staleCampaigns.length) {
    await sheets.deleteRows(CAMPAIGNS_TAB, staleCampaigns.map((r) => r._row));
  }

  const remainingCampaignIdsAfterDelete = new Set(
    (await sheets.getRows(CAMPAIGNS_TAB)).map((r) => String(r.id)),
  );
  const attachmentRows = await sheets.getRows(ATTACHMENTS_TAB);
  const orphanAttachments = attachmentRows.filter((r) => !remainingCampaignIdsAfterDelete.has(String(r.campaign_id)));
  if (orphanAttachments.length) {
    await sheets.deleteRows(ATTACHMENTS_TAB, orphanAttachments.map((r) => r._row));
  }

  return {
    deletedSentRecipients: sentStale.length,
    deletedFailedRecipients: failedStale.length,
    deletedStaleCampaigns: staleCampaigns.length,
    deletedOrphanAttachments: orphanAttachments.length,
  };
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToCampaign(row: sheets.SheetRow): Campaign {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    label: String(row.label),
    kind: row.kind as CampaignKind,
    status: row.status as CampaignStatus,
    scheduledAt: row.scheduled_at ? String(row.scheduled_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    totalEmails: Number(row.total_emails ?? 0),
    sentCount: Number(row.sent_count ?? 0),
    failedCount: Number(row.failed_count ?? 0),
    smtpConfigJson: String(row.smtp_config_json ?? '{}'),
    templateJson: String(row.template_json ?? '{}'),
    error: row.error ? String(row.error) : undefined,
  };
}

function rowToRecipient(row: sheets.SheetRow): CampaignRecipient {
  return {
    id: Number(row.id),
    campaignId: String(row.campaign_id),
    email: String(row.email),
    recipientJson: String(row.recipient_json),
    status: row.status as RecipientStatus,
    scheduledAt: row.scheduled_at ? String(row.scheduled_at) : undefined,
    error: row.error ? String(row.error) : undefined,
    sentAt: row.sent_at ? String(row.sent_at) : undefined,
    createdAt: String(row.created_at),
  };
}

function rowToAttachment(row: sheets.SheetRow): CampaignAttachment {
  return {
    id: Number(row.id),
    campaignId: String(row.campaign_id),
    recipientEmail: row.recipient_email ? String(row.recipient_email) : undefined,
    attachmentId: String(row.attachment_id),
    filename: String(row.filename),
    contentType: String(row.content_type),
    storageUrl: String(row.storage_url),
    fileSizeBytes: Number(row.file_size_bytes ?? 0),
    createdAt: String(row.created_at),
  };
}
