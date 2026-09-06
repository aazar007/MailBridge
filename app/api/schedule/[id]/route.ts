import { NextRequest, NextResponse } from 'next/server';
import {
  deleteSendJob,
  loadSendJob,
  publicJobView,
  saveSendJob,
} from '@/lib/send-job-store';
import { cleanupJobAttachments } from '@/lib/scheduled-attachments';

/** Pure read for polling a single job's live progress — no side effects,
 *  no processing triggered. Advancing chunks is driven by GET /api/schedule
 *  (the general 30s poll) or the daily cron, same as before this existed. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await loadSendJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }
  return NextResponse.json(publicJobView(job));
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { scheduledAt } = await req.json();

  const job = await loadSendJob(id);
  if (!job || (job.status !== 'pending' && job.status !== 'partial')) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
  }

  job.scheduledAt = scheduledAt;
  await saveSendJob(job);
  return NextResponse.json(publicJobView(job));
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const job = await loadSendJob(id);
  if (!job) {
    return NextResponse.json({ error: 'Schedule not found' }, { status: 404 });
  }
  await cleanupJobAttachments(job.payload.attachmentMap, id);
  await deleteSendJob(id);
  return NextResponse.json({ ok: true });
}
