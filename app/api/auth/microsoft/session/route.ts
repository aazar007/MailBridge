import { NextRequest, NextResponse } from 'next/server';
import { getOutlookProfile, getValidOutlookAccessToken } from '@/lib/outlook-oauth';

export async function GET(req: NextRequest) {
  const tokenRaw = req.cookies.get('outlook_token')?.value;
  if (!tokenRaw) {
    return NextResponse.json({ connected: false });
  }

  try {
    const token = await getValidOutlookAccessToken(tokenRaw);
    const profile = await getOutlookProfile(token);
    return NextResponse.json({ connected: true, ...profile });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
