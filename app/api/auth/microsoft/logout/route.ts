import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { origin, searchParams } = new URL(req.url);
  const returnTo = searchParams.get('return') || '/main';
  const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/main';
  const res = NextResponse.redirect(`${origin}${safeReturn}`);
  res.cookies.delete('outlook_token');
  return res;
}
