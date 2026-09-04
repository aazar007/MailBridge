import { NextRequest, NextResponse } from 'next/server';
import { getGmailProfile } from '@/lib/gmail-oauth';

export async function GET(req: NextRequest) {
  const token = req.cookies.get('gmail_token')?.value;
  if (!token) {
    return NextResponse.json({ connected: false });
  }

  try {
    const profile = await getGmailProfile(token);
    return NextResponse.json({ connected: true, ...profile });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
