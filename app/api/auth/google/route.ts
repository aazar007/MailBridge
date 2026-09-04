import { NextRequest, NextResponse } from 'next/server';
import { createOAuth2Client, getGmailRedirectUri, GMAIL_SCOPES } from '@/lib/gmail-oauth';

export async function GET(req: NextRequest) {
  const { origin } = new URL(req.url);
  const returnTo = new URL(req.url).searchParams.get('return') ?? '/main';
  const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/main';
  const auth = createOAuth2Client(getGmailRedirectUri(origin));
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GMAIL_SCOPES,
    state: safeReturn,
  });
  return NextResponse.redirect(url);
}
