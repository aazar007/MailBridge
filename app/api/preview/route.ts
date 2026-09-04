import { NextRequest } from 'next/server';
import { replacePlaceholders, getRecipientName } from '@/lib/template';
import { appendSignatureIfMissing } from '@/lib/email-body';

function ensureDirection(html: string): string {
  if (/dir\s*=/i.test(html)) return html;
  if (/<html\b/i.test(html)) return html.replace(/<html\b([^>]*)>/i, '<html$1 dir="auto">');
  if (/<body\b/i.test(html)) return html.replace(/<body\b([^>]*)>/i, '<body$1 dir="auto">');
  return `<div dir="auto">${html}</div>`;
}

export async function POST(req: NextRequest) {
  try {
    const { template, recipients } = await req.json();
    const templateSignature = template.signature ?? '';

    const previews = (recipients as Record<string, string>[])
      .slice(0, 3)
      .map((recipient) => {
        const toName = getRecipientName(recipient);
        return {
          to: recipient.email,
          toName,
          subject: replacePlaceholders(template.subject, recipient),
          body: ensureDirection(
            appendSignatureIfMissing(
              replacePlaceholders(template.body, recipient),
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
