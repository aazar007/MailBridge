import { NextRequest, NextResponse } from 'next/server';
import { getGmailClient, getHeader } from '@/lib/gmail-oauth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('gmail_token')?.value;
  if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const gmail = getGmailClient(token);

    const listRes = await gmail.users.drafts.list({ userId: 'me', maxResults: 100 });
    const items = listRes.data.drafts ?? [];

    const drafts = await Promise.all(
      items.map(async (d) => {
        const meta = await gmail.users.drafts.get({
          userId: 'me',
          id: d.id!,
          format: 'full',
        });
        const headers = meta.data.message?.payload?.headers ?? [];
        return {
          id: d.id,
          messageId: d.message?.id ?? '',
          subject: getHeader(headers, 'subject') || '(no subject)',
          date: getHeader(headers, 'date'),
        };
      })
    );

    return NextResponse.json({ drafts });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('invalid_grant') || msg.includes('Invalid Credentials')) {
      return NextResponse.json({ error: 'Token expired' }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
