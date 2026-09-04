import { NextRequest, NextResponse } from 'next/server';
import { listOutlookDrafts, getValidOutlookAccessToken } from '@/lib/outlook-oauth';

export async function GET(req: NextRequest) {
  const tokenRaw = req.cookies.get('outlook_token')?.value;
  if (!tokenRaw) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const token = await getValidOutlookAccessToken(tokenRaw);
    const drafts = await listOutlookDrafts(token);
    return NextResponse.json({ drafts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
