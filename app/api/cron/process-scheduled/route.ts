/**
 * GET /api/cron/process-scheduled
 *
 * Cron Job 1 — Scheduled email processor.
 *
 * Recommended schedule  : every minute  ("* * * * *")  — requires Vercel Pro.
 * Fallback schedule     : hourly         ("0 * * * *")  — works on Vercel Hobby.
 *
 * Algorithm (throttled batch):
 *   1. Pull ≤ BATCH_SIZE campaign recipients whose scheduled_at ≤ now.
 *   2. Send each email via the campaign's SMTP / Gmail / Outlook config.
 *   3. Write every outcome from this tick in ONE batched Sheets call, then
 *      reconcile affected campaigns' status in a SECOND batched call.
 *      (Sheets has no SQL batch()/atomic increment — writing per-recipient
 *      like the old Turso code did would mean 100+ API calls/tick and blow
 *      past Sheets' per-minute quota, so every recipient's outcome is held
 *      in memory until the end of the tick.)
 *   4. Stop before VERCEL_TIMEOUT_MS to avoid mid-batch interruption.
 */

import { NextRequest, NextResponse } from 'next/server';
import { processDueScheduledJobs } from '@/lib/process-scheduled';
import {
  getDueCampaignRecipients,
  getAttachmentsForRecipient,
  applyRecipientResults,
  reconcileCampaignStatuses,
  type CampaignRecipient,
  type RecipientResult,
} from '@/lib/campaign-store';
import { getTokens } from '@/lib/token-store';
import { createTransporter, sendEmail, type SmtpConfig } from '@/lib/smtp';
import { replacePlaceholders, getRecipientName } from '@/lib/template';
import { appendSignatureIfMissing } from '@/lib/email-body';
import { ensureDirection } from '@/lib/send-utils';
import { sendGmailEmail } from '@/lib/gmail-oauth';
import { sendOutlookEmail, getValidOutlookAccessToken } from '@/lib/outlook-oauth';
import { withTimeout, SETUP_CALL_TIMEOUT_MS, SEND_CALL_TIMEOUT_MS } from '@/lib/with-timeout';

export const maxDuration = 60;

// Stop processing when this many milliseconds remain before Vercel's limit.
const VERCEL_TIMEOUT_MS = 55_000;

// Max recipients per cron tick — keeps sends manageable and avoids SMTP bans.
const BATCH_SIZE = 50;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === 'development';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const results = { legacy: { processed: 0, ids: [] as string[] }, campaigns: { sent: 0, failed: 0 } };

  // ── Legacy path (existing send_jobs / send_recipients) ──────────────────────
  // Kept so in-flight jobs scheduled before this upgrade still complete.
  try {
    results.legacy = await processDueScheduledJobs();
  } catch (err) {
    console.error('[cron:process-scheduled] legacy path error:', err);
  }

  // ── Campaign path (new architecture) ────────────────────────────────────────
  try {
    const due = await getDueCampaignRecipients(BATCH_SIZE);
    const outcomes: RecipientResult[] = [];

    for (let i = 0; i < due.length; i++) {
      // Hard-stop before hitting the Vercel function timeout.
      if (Date.now() - started >= VERCEL_TIMEOUT_MS) break;

      const recipient = due[i];
      const outcome = await sendCampaignRecipient(recipient);
      outcomes.push(outcome);

      if (outcome.status === 'sent') results.campaigns.sent++;
      else results.campaigns.failed++;

      // Respect the campaign's own delay-between-sends setting so bulk
      // campaign sends get the same provider-friendly pacing as the legacy
      // job path (lib/run-send.ts) and instant send (app/api/send/route.ts).
      if (i < due.length - 1 && outcome.delayMs > 0) {
        const elapsed = Date.now() - started;
        if (elapsed + outcome.delayMs >= VERCEL_TIMEOUT_MS) break;
        await new Promise((resolve) => setTimeout(resolve, outcome.delayMs));
      }
    }

    // One batched write for every recipient touched this tick, instead of
    // one write per recipient — this is what keeps Sheets API usage flat.
    await applyRecipientResults(outcomes);
    await reconcileCampaignStatuses(outcomes.map((o) => o.campaignId));
  } catch (err) {
    console.error('[cron:process-scheduled] campaign path error:', err);
  }

  return NextResponse.json({
    ok: true,
    elapsed_ms: Date.now() - started,
    ...results,
  });
}

// ─── Send one campaign recipient's email (batched DB writes happen in the caller) ───

type CampaignSendOutcome = RecipientResult & { delayMs: number };

async function sendCampaignRecipient(recipient: CampaignRecipient): Promise<CampaignSendOutcome> {
  let smtpConfig: Record<string, unknown>;
  let template: { subject: string; body: string; signature?: string };
  let useGmailApi = false;
  let useOutlookGraph = false;

  try {
    const ctx = JSON.parse(recipient.recipientJson) as {
      email: string;
      smtpConfig?: Record<string, unknown>;
      template?: { subject: string; body: string; signature?: string };
      useGmailApi?: boolean;
      useOutlookGraph?: boolean;
      [key: string]: unknown;
    };

    smtpConfig = ctx.smtpConfig ?? {};
    template = ctx.template ?? { subject: '', body: '' };
    useGmailApi = !!ctx.useGmailApi;
    useOutlookGraph = !!ctx.useOutlookGraph;
  } catch {
    return { recipientId: recipient.id, campaignId: recipient.campaignId, status: 'failed', error: 'Corrupt recipient context JSON', delayMs: 0 };
  }

  const delayMs = Number(smtpConfig.delayMs) || 0;

  try {
    // Live tokens never live in recipient_json — resolved from the
    // send_tokens table by campaign_id instead (see lib/token-store.ts).
    const tokens = (useGmailApi || useOutlookGraph) ? await getTokens(recipient.campaignId) : {};

    const recipientData = JSON.parse(recipient.recipientJson) as Record<string, string>;
    const subject = replacePlaceholders(template.subject, recipientData);
    const body    = ensureDirection(
      appendSignatureIfMissing(
        replacePlaceholders(template.body, recipientData),
        template.signature ?? '',
      ),
    );
    const toName = getRecipientName(recipientData);

    const attachmentRefs = await getAttachmentsForRecipient(recipient.campaignId, recipient.email);
    const attachments = attachmentRefs.map((a) => ({
      id:          a.attachmentId,
      filename:    a.filename,
      contentType: a.contentType,
      content:     a.storageUrl,   // signed URL — download at send time if needed
    }));

    if (useGmailApi) {
      if (!tokens.gmailToken) throw new Error('Gmail token missing');
      await withTimeout(
        sendGmailEmail(tokens.gmailToken, {
          to: recipient.email,
          toName,
          subject,
          html: body,
          fromName: String(smtpConfig.fromName ?? ''),
          fromEmail: String(smtpConfig.user     ?? ''),
          attachments,
        }),
        SEND_CALL_TIMEOUT_MS,
        'sendGmailEmail',
      );
    } else if (useOutlookGraph) {
      if (!tokens.outlookTokens) throw new Error('Outlook token missing');
      const accessToken = await withTimeout(
        getValidOutlookAccessToken(tokens.outlookTokens),
        SETUP_CALL_TIMEOUT_MS,
        'getValidOutlookAccessToken',
      );
      await withTimeout(
        sendOutlookEmail(accessToken, {
          to: recipient.email,
          toName,
          subject,
          html: body,
          fromName:  String(smtpConfig.fromName ?? ''),
          fromEmail: String(smtpConfig.user     ?? ''),
          attachments,
        }),
        SEND_CALL_TIMEOUT_MS,
        'sendOutlookEmail',
      );
    } else {
      const transporter = createTransporter(smtpConfig as unknown as SmtpConfig);
      await withTimeout(
        sendEmail(transporter, smtpConfig as unknown as SmtpConfig, {
          to: recipient.email,
          toName,
          subject,
          html: body,
          attachments,
        }),
        SEND_CALL_TIMEOUT_MS,
        'sendEmail',
      );
    }

    return { recipientId: recipient.id, campaignId: recipient.campaignId, status: 'sent', delayMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { recipientId: recipient.id, campaignId: recipient.campaignId, status: 'failed', error: message, delayMs };
  }
}
