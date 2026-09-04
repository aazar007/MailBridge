import { NextRequest, NextResponse } from 'next/server';
import {
  deleteWorkSession,
  loadWorkSession,
  saveWorkSession,
  type WorkSessionData,
} from '@/lib/work-session';

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId') ?? '';
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const session = await loadWorkSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  return NextResponse.json({ session });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const data: WorkSessionData = {
    recipients: Array.isArray(body.recipients) ? body.recipients : [],
    columns: Array.isArray(body.columns) ? body.columns : [],
    attachmentAssignments: body.attachmentAssignments ?? {},
    attachmentFiles: Array.isArray(body.attachmentFiles) ? body.attachmentFiles : [],
  };

  try {
    await saveWorkSession(sessionId, data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  await deleteWorkSession(sessionId);
  return NextResponse.json({ ok: true });
}
