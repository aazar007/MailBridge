import { NextRequest, NextResponse } from 'next/server';
import { getGmailClient, extractBody, getHeader } from '@/lib/gmail-oauth';
import { splitEmbeddedSignature } from '@/lib/email-body';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = req.cookies.get('gmail_token')?.value;
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const { id } = await params;
    const gmail = getGmailClient(token);

    const draft = await gmail.users.drafts.get({
      userId: 'me',
      id,
      format: 'full',
    });

    const payload = draft.data.message?.payload;
    const headers = payload?.headers ?? [];

    const subject = getHeader(headers, 'subject');
    const html = payload ? extractBody(payload) : '';
    const { body, signature } = splitEmbeddedSignature(html);

    return NextResponse.json({ subject, body, signature });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
