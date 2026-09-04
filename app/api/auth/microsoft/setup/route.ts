import { NextRequest, NextResponse } from 'next/server';
import { getMicrosoftSecretIssue, getOutlookRedirectUri } from '@/lib/outlook-oauth';

export async function GET(req: NextRequest) {
  const { origin } = new URL(req.url);
  const secret = process.env.MICROSOFT_CLIENT_SECRET;

  return NextResponse.json({
    clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
    redirectUri: getOutlookRedirectUri(origin),
    secretConfigured: Boolean(secret?.trim()),
    secretIssue: getMicrosoftSecretIssue(secret),
  });
}
