import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens } from '@/lib/outlook-oauth';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const errorDesc = searchParams.get('error_description');

  if (error || !code) {
    const msg = encodeURIComponent(errorDesc ?? error ?? 'Authentication failed');
    return NextResponse.redirect(`${origin}/main?provider=outlook&error=${msg}`);
  }

  try {
    const redirectUri = process.env.MICROSOFT_REDIRECT_URI ?? `${origin}/api/auth/microsoft/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const returnTo = req.nextUrl.searchParams.get('state') || '/main';
    const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/main';
    const res = NextResponse.redirect(`${origin}${safeReturn}`);
    res.cookies.set('outlook_token', JSON.stringify(tokens), { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' });
    return res;
  } catch (e) {
    const msg = encodeURIComponent(String(e));
    return NextResponse.redirect(`${origin}/main?provider=outlook&error=${msg}`);
  }
}
