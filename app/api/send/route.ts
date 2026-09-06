import { NextRequest } from 'next/server';
import { createTransporter, sendEmail, SmtpConfig } from '@/lib/smtp';
import { replacePlaceholders, getRecipientName } from '@/lib/template';
import { sendOutlookEmail, getValidOutlookAccessToken, getOutlookSignature } from '@/lib/outlook-oauth';
import { sendGmailEmail, getGmailSignature } from '@/lib/gmail-oauth';
import type { EmailAttachment } from '@/lib/send-types';
import { appendSignatureIfMissing } from '@/lib/email-body';
import { hydrateScheduledAttachmentMap, getAttachmentIdsFromMap, deleteScheduledAttachments, emptyComposerFiles } from '@/lib/scheduled-attachments';
import { deleteWorkSession } from '@/lib/work-session';
import { assertRecipientLimit } from '@/lib/temp-limits';
import { withTimeout, SETUP_CALL_TIMEOUT_MS, SEND_CALL_TIMEOUT_MS } from '@/lib/with-timeout';
import { effectiveDelayMs } from '@/lib/send-pacing';

// Instant send has no resumable/chunked continuation (unlike /api/schedule) —
// it's one live request for the whole recipient list. With the enforced 2s+
// minimum delay between sends (lib/send-pacing.ts), a full-size batch alone
// needs well over 60s; Fluid Compute supports up to 300s on this plan.
export const maxDuration = 300;

function ensureDirection(html: string): string {
  if (/dir\s*=/i.test(html)) return html;
  if (/<html\b/i.test(html)) return html.replace(/<html\b([^>]*)>/i, '<html$1 dir="auto">');
  if (/<body\b/i.test(html)) return html.replace(/<body\b([^>]*)>/i, '<body$1 dir="auto">');
  return `<div dir="auto">${html}</div>`;
}

async function sendBatch(
  emit: (data: object) => void,
  recipients: Record<string, string>[],
  template: { subject: string; body: string; signature?: string },
  smtpConfig: SmtpConfig,
  attachmentMap: Record<string, EmailAttachment[]>,
  sendOne: (
    recipient: Record<string, string>,
    subject: string,
    body: string,
    toName: string,
    attachments: EmailAttachment[],
  ) => Promise<void>,
) {
  emit({ type: 'start', total: recipients.length });
  const templateSignature = template.signature ?? '';

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];

    try {
      const subject = replacePlaceholders(template.subject, recipient);
      const body = ensureDirection(
        appendSignatureIfMissing(
          replacePlaceholders(template.body, recipient),
          templateSignature,
        ),
      );
      const toName = getRecipientName(recipient);
      const attachments = attachmentMap[recipient.email] ?? [];

      await sendOne(recipient, subject, body, toName, attachments);
      emit({ type: 'sent', index: i, email: recipient.email, success: true });
    } catch (err) {
      emit({
        type: 'sent',
        index: i,
        email: recipient.email,
        success: false,
        error: String(err),
      });
    }

    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, effectiveDelayMs(smtpConfig.delayMs)));
    }
  }

  emit({ type: 'done' });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    smtpConfig,
    template,
    recipients,
    useOutlookGraph,
    useGmailApi,
    sessionId,
  } = body;
  let { attachmentMap = {} } = body;
  const outlookToken = req.cookies.get('outlook_token')?.value;
  const gmailToken = req.cookies.get('gmail_token')?.value;
  const encoder = new TextEncoder();

  try {
    assertRecipientLimit(recipients?.length ?? 0);
    attachmentMap = await hydrateScheduledAttachmentMap(attachmentMap);
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        if (useGmailApi) {
          if (!gmailToken) {
            emit({
              type: 'error',
              fatal: true,
              message: 'Gmail not connected. Sign in with Google on step 1, then try again.',
            });
            return;
          }

          const gmailSignature = await withTimeout(
            getGmailSignature(gmailToken, smtpConfig.user),
            SETUP_CALL_TIMEOUT_MS,
            'getGmailSignature',
          ).catch(() => '');
          console.log(`[POST /api/send] gmailSignature length: ${gmailSignature.length}, template.signature length: ${template.signature?.length ?? 0}`);
          const templateWithSig = {
            ...template,
            signature: template.signature || gmailSignature,
          };

          await sendBatch(
            emit,
            recipients,
            templateWithSig,
            smtpConfig as SmtpConfig,
            attachmentMap,
            async (_recipient, subject, body, toName, attachments) => {
              await withTimeout(
                sendGmailEmail(gmailToken, {
                  to: _recipient.email,
                  toName,
                  subject,
                  html: body,
                  fromName: smtpConfig.fromName,
                  fromEmail: smtpConfig.user,
                  attachments,
                }),
                SEND_CALL_TIMEOUT_MS,
                'sendGmailEmail',
              );
            },
          );
          return;
        }

        if (useOutlookGraph) {
          if (!outlookToken) {
            emit({
              type: 'error',
              fatal: true,
              message: 'Outlook not connected. Sign in with Microsoft on step 1, then try again.',
            });
            return;
          }

          const outlookAccessToken = await withTimeout(
            getValidOutlookAccessToken(outlookToken),
            SETUP_CALL_TIMEOUT_MS,
            'getValidOutlookAccessToken',
          );
          const outlookSignature = await withTimeout(
            getOutlookSignature(outlookAccessToken),
            SETUP_CALL_TIMEOUT_MS,
            'getOutlookSignature',
          ).catch(() => '');
          const templateWithSig = {
            ...template,
            signature: template.signature || outlookSignature,
          };

          await sendBatch(
            emit,
            recipients,
            templateWithSig,
            smtpConfig as SmtpConfig,
            attachmentMap,
            async (_recipient, subject, body, toName, attachments) => {
              await withTimeout(
                sendOutlookEmail(outlookAccessToken, {
                  to: _recipient.email,
                  toName,
                  subject,
                  html: body,
                  fromName: smtpConfig.fromName,
                  fromEmail: smtpConfig.user,
                  attachments,
                }),
                SEND_CALL_TIMEOUT_MS,
                'sendOutlookEmail',
              );
            },
          );
          return;
        }

        let transporter;
        try {
          transporter = createTransporter(smtpConfig as SmtpConfig);
          await withTimeout(transporter.verify(), SETUP_CALL_TIMEOUT_MS, 'transporter.verify');
        } catch (err) {
          emit({ type: 'error', fatal: true, message: `SMTP connection failed: ${err}` });
          return;
        }

        await sendBatch(
          emit,
          recipients,
          template,
          smtpConfig as SmtpConfig,
          attachmentMap,
          async (_recipient, subject, body, toName, attachments) => {
            await withTimeout(
              sendEmail(transporter!, smtpConfig as SmtpConfig, {
                to: _recipient.email,
                toName,
                subject,
                html: body,
                attachments,
              }),
              SEND_CALL_TIMEOUT_MS,
              'sendEmail',
            );
          },
        );
      } finally {
        try {
          const attachmentIds = getAttachmentIdsFromMap(attachmentMap);
          if (typeof sessionId === 'string' && sessionId) {
            await deleteWorkSession(sessionId, attachmentIds);
          } else {
            if (attachmentIds.length > 0) {
              await deleteScheduledAttachments(attachmentIds);
            }
            // Use emptyComposerFiles (not emptyFilesHandler) to preserve any
            // attachment rows already claimed by a pending scheduled job.
            await emptyComposerFiles();
          }
        } catch (err) {
          console.error('post-send file cleanup failed:', err);
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
