import { NextRequest } from 'next/server';
import { replacePlaceholders, getRecipientName } from '@/lib/template';
import { appendSignatureIfMissing, injectInlineImages } from '@/lib/email-body';
import type { EmailAttachment } from '@/lib/send-types';

function ensureDirection(html: string): string {
  if (/dir\s*=/i.test(html)) return html;
  if (/<html\b/i.test(html)) return html.replace(/<html\b([^>]*)>/i, '<html$1 dir="auto">');
  if (/<body\b/i.test(html)) return html.replace(/<body\b([^>]*)>/i, '<body$1 dir="auto">');
  return `<div dir="auto">${html}</div>`;
}

// cid: URLs only resolve inside a real email client rendering the actual
// MIME message — the in-browser Preview step needs a data: URI built from
// the attachment's own content instead, so the image actually renders here.
function dataUriSrc(a: { contentType?: string; content?: string }): string {
  return `data:${a.contentType || 'application/octet-stream'};base64,${a.content ?? ''}`;
}

export async function POST(req: NextRequest) {
  try {
    const { template, recipients, attachmentMap } = await req.json();
    const templateSignature = template.signature ?? '';
    const map = (attachmentMap ?? {}) as Record<string, EmailAttachment[]>;

    const previews = (recipients as Record<string, string>[])
      .slice(0, 3)
      .map((recipient) => {
        const toName = getRecipientName(recipient);
        const attachments = map[recipient.email] ?? [];
        return {
          to: recipient.email,
          toName,
          subject: replacePlaceholders(template.subject, recipient),
          body: ensureDirection(
            appendSignatureIfMissing(
              injectInlineImages(replacePlaceholders(template.body, recipient), attachments, dataUriSrc),
              templateSignature,
            ),
          ),
        };
      });

    return Response.json({ previews });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
