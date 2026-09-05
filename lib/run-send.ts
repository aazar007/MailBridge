import { createTransporter, sendEmail, type SmtpConfig } from '@/lib/smtp';
import { replacePlaceholders, getRecipientName } from '@/lib/template';
import { sendOutlookEmail, getValidOutlookAccessToken, getOutlookSignature } from '@/lib/outlook-oauth';
import { sendGmailEmail, getGmailSignature } from '@/lib/gmail-oauth';
import type { EmailAttachment, SendPayload } from '@/lib/send-types';
import { appendSignatureIfMissing } from '@/lib/email-body';
import { ensureDirection, type SendResultItem } from '@/lib/send-utils';
import {
  getPendingRecipients,
  getJobStats,
  applyRecipientResults,
  type RecipientResult,
} from '@/lib/send-job-store';
import { SEND_TIME_BUDGET_MS, type RunSendJobResult } from '@/lib/send-job-types';
import { withTimeout, SETUP_CALL_TIMEOUT_MS, SEND_CALL_TIMEOUT_MS } from '@/lib/with-timeout';

export interface RunSendInput {
  payload: SendPayload;
  gmailToken?: string;
  outlookTokens?: string;
  jobId?: string;
}

async function prepareSendContext(input: RunSendInput) {
  const { payload, gmailToken, outlookTokens } = input;
  const { smtpConfig, useOutlookGraph, useGmailApi } = payload;
  let outlookAccessToken: string | undefined;
  let signatureForSend = payload.template.signature ?? '';

  if (useGmailApi) {
    if (!gmailToken) {
      throw new Error('Gmail not connected when this send was scheduled. Sign in again and reschedule.');
    }
    const gmailSignature = await withTimeout(
      getGmailSignature(gmailToken, smtpConfig.user),
      SETUP_CALL_TIMEOUT_MS,
      'getGmailSignature',
    ).catch(() => ''); // getGmailSignature already swallows its own errors; a timeout should behave the same way.
    console.log(`[runSendJob] gmailSignature length: ${gmailSignature.length}, template.signature length: ${payload.template.signature?.length ?? 0}`);
    if (!signatureForSend) signatureForSend = gmailSignature;
  }

  if (useOutlookGraph) {
    if (!outlookTokens) {
      throw new Error('Outlook not connected when this send was scheduled. Sign in again and reschedule.');
    }
    outlookAccessToken = await withTimeout(
      getValidOutlookAccessToken(outlookTokens),
      SETUP_CALL_TIMEOUT_MS,
      'getValidOutlookAccessToken',
    );
    const outlookSignature = await withTimeout(
      getOutlookSignature(outlookAccessToken),
      SETUP_CALL_TIMEOUT_MS,
      'getOutlookSignature',
    ).catch(() => '');
    if (!signatureForSend) signatureForSend = outlookSignature;
  }

  let transporter;
  if (!useGmailApi && !useOutlookGraph) {
    transporter = createTransporter(smtpConfig as SmtpConfig);
    await withTimeout(transporter.verify(), SETUP_CALL_TIMEOUT_MS, 'transporter.verify');
  }

  return { outlookAccessToken, signatureForSend, transporter };
}

async function sendOneRecipient(
  input: RunSendInput,
  recipient: Record<string, string>,
  attachmentMap: Record<string, EmailAttachment[]>,
  signatureForSend: string,
  outlookAccessToken: string | undefined,
  transporter: ReturnType<typeof createTransporter> | undefined,
  callTimeoutMs: number,
): Promise<void> {
  const { payload, gmailToken } = input;
  const { smtpConfig, template, useOutlookGraph, useGmailApi } = payload;

  const subject = replacePlaceholders(template.subject, recipient);
  const body = ensureDirection(
    appendSignatureIfMissing(
      replacePlaceholders(template.body, recipient),
      signatureForSend,
    ),
  );
  const toName = getRecipientName(recipient);
  const attachments: EmailAttachment[] = attachmentMap[recipient.email] ?? [];

  if (useGmailApi) {
    await withTimeout(
      sendGmailEmail(gmailToken!, {
        to: recipient.email,
        toName,
        subject,
        html: body,
        fromName: smtpConfig.fromName,
        fromEmail: smtpConfig.user,
        attachments,
      }),
      callTimeoutMs,
      'sendGmailEmail',
    );
  } else if (useOutlookGraph) {
    await withTimeout(
      sendOutlookEmail(outlookAccessToken!, {
        to: recipient.email,
        toName,
        subject,
        html: body,
        fromName: smtpConfig.fromName,
        fromEmail: smtpConfig.user,
        attachments,
      }),
      callTimeoutMs,
      'sendOutlookEmail',
    );
  } else {
    await withTimeout(
      sendEmail(transporter!, smtpConfig as SmtpConfig, {
        to: recipient.email,
        toName,
        subject,
        html: body,
        attachments,
      }),
      callTimeoutMs,
      'sendEmail',
    );
  }
}

/**
 * Resumable job send — stops before Vercel timeout and continues on next poll.
 *
 * budgetMs bounds THIS call's total time. Defaults to SEND_TIME_BUDGET_MS,
 * but a caller processing several due jobs in one tick (see
 * processDueScheduledJobs) must pass whatever's actually left of its own
 * shared budget — otherwise each job independently getting a fresh 50s
 * could add up past the whole function's Vercel maxDuration.
 */
export async function runSendJob(
  input: RunSendInput & { jobId: string },
  budgetMs: number = SEND_TIME_BUDGET_MS,
): Promise<RunSendJobResult> {
  const { payload, jobId } = input;
  const { smtpConfig, attachmentMap = {} } = payload;
  const pending = await getPendingRecipients(jobId);
  const batchResults: SendResultItem[] = [];
  const started = Date.now();

  const { outlookAccessToken, signatureForSend, transporter } = await prepareSendContext(input);

  // Collect outcomes in memory and write them to the Sheet in one batched
  // call after the loop — sending N recipients with a per-recipient Sheets
  // write each was measured to exhaust Google's 60-reads/min quota on just
  // a couple of recipients (see applyRecipientResults in send-job-store.ts).
  const recipientResults: RecipientResult[] = [];

  for (let i = 0; i < pending.length; i++) {
    const remainingBudget = budgetMs - (Date.now() - started);
    if (remainingBudget <= 0) break;

    // Cap this call's own timeout to whatever budget is actually left —
    // a fixed SEND_CALL_TIMEOUT_MS could still let a call starting near the
    // budget's edge run past it, and past Vercel's hard maxDuration with it.
    const callTimeoutMs = Math.min(SEND_CALL_TIMEOUT_MS, remainingBudget);

    const recipient = pending[i];
    try {
      await sendOneRecipient(
        input,
        recipient,
        attachmentMap,
        signatureForSend,
        outlookAccessToken,
        transporter,
        callTimeoutMs,
      );
      recipientResults.push({ email: recipient.email, status: 'sent' });
      batchResults.push({ email: recipient.email, success: true });
    } catch (err) {
      const message = String(err);
      recipientResults.push({ email: recipient.email, status: 'failed', error: message });
      batchResults.push({ email: recipient.email, success: false, error: message });
    }

    if (i < pending.length - 1 && smtpConfig.delayMs > 0) {
      const elapsed = Date.now() - started;
      if (elapsed + smtpConfig.delayMs >= budgetMs) break;
      await new Promise((resolve) => setTimeout(resolve, smtpConfig.delayMs));
    }
  }

  await applyRecipientResults(jobId, recipientResults);
  const stats = await getJobStats(jobId);
  return {
    batchResults,
    done: stats.pending === 0,
    stats,
  };
}

/** Send all recipients in one run (instant send from browser). */
export async function runSend(input: RunSendInput): Promise<SendResultItem[]> {
  const { payload } = input;
  const { smtpConfig, recipients, attachmentMap = {} } = payload;
  const results: SendResultItem[] = [];

  const { outlookAccessToken, signatureForSend, transporter } = await prepareSendContext(input);

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    try {
      await sendOneRecipient(
        input,
        recipient,
        attachmentMap,
        signatureForSend,
        outlookAccessToken,
        transporter,
        SEND_CALL_TIMEOUT_MS,
      );
      results.push({ email: recipient.email, success: true });
    } catch (err) {
      results.push({ email: recipient.email, success: false, error: String(err) });
    }

    if (i < recipients.length - 1 && smtpConfig.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, smtpConfig.delayMs));
    }
  }

  return results;
}
