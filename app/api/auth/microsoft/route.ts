import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl, getMicrosoftSecretIssue, getOutlookRedirectUri } from '@/lib/outlook-oauth';

export async function GET(req: NextRequest) {
  const { origin } = new URL(req.url);
  if (!process.env.MICROSOFT_CLIENT_ID) {
    return NextResponse.redirect(
      `${origin}/main?provider=outlook&error=${encodeURIComponent('MICROSOFT_CLIENT_ID not set in Vercel env vars')}`
    );
  }
  const secretIssue = getMicrosoftSecretIssue(process.env.MICROSOFT_CLIENT_SECRET);
  if (secretIssue) {
    return NextResponse.redirect(`${origin}/main?provider=outlook&error=${encodeURIComponent(secretIssue)}`);
  }
  const returnTo = new URL(req.url).searchParams.get('return') ?? '/main';
  return NextResponse.redirect(getAuthUrl(getOutlookRedirectUri(origin), returnTo));
}
