import { NextRequest, NextResponse } from 'next/server';
import { getGmailRedirectUri } from '@/lib/gmail-oauth';

export async function GET(req: NextRequest) {
  const { origin } = new URL(req.url);

  return NextResponse.json({
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    redirectUri: getGmailRedirectUri(origin),
  });
}
