import { NextRequest, NextResponse } from 'next/server';
import { getGmailSignatureInfo } from '@/lib/gmail-oauth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('gmail_token')?.value;
  if (!token) {
    return NextResponse.json({ connected: false, signature: '' }, { status: 401 });
  }

  try {
    const fromEmail = req.nextUrl.searchParams.get('from') ?? undefined;
    const info = await getGmailSignatureInfo(token, fromEmail);
    return NextResponse.json({
      connected: true,
      signature: info.signature,
      sendAsEmail: info.sendAsEmail,
      hasSignature: info.signature.trim().length > 0,
    });
  } catch (err) {
    console.error('[GET /api/auth/google/signature] failed:', err);
    return NextResponse.json(
      {
        connected: true,
        signature: '',
        hasSignature: false,
        error: 'Could not read Gmail signature. Reconnect Google and approve Gmail settings access.',
      },
      { status: 502 },
    );
  }
}
