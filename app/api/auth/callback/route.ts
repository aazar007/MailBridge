import { NextRequest, NextResponse } from 'next/server';
import { createOAuth2Client, getGmailRedirectUri } from '@/lib/gmail-oauth';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');
  const { origin } = new URL(req.url);
  const returnTo = req.nextUrl.searchParams.get('state') || '/main';
  const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/main';

  if (error || !code) {
    const msg = encodeURIComponent(error ?? 'access_denied');
    return NextResponse.redirect(`${origin}/main?provider=gmail&error=${msg}`);
  }

  try {
    const auth = createOAuth2Client(getGmailRedirectUri(origin));
    const { tokens } = await auth.getToken(code);

    const res = NextResponse.redirect(`${origin}${safeReturn}`);
    res.cookies.set('gmail_token', JSON.stringify(tokens), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    });
    return res;
  } catch {
    return NextResponse.redirect(`${origin}/main?provider=gmail&error=token_exchange_failed`);
  }
}
