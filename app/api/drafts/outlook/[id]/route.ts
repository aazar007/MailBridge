import { NextRequest, NextResponse } from 'next/server';
import { getOutlookDraft, getValidOutlookAccessToken } from '@/lib/outlook-oauth';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const tokenRaw = req.cookies.get('outlook_token')?.value;
  if (!tokenRaw) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const token = await getValidOutlookAccessToken(tokenRaw);
    const { id } = await params;
    const draft = await getOutlookDraft(token, id);
    return NextResponse.json(draft);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
