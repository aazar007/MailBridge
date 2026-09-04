import { NextRequest, NextResponse } from 'next/server';
import { processDueScheduledJobs } from '@/lib/process-scheduled';
import {
  createSendJob,
  deleteScheduledJobsByStatus,
  listActiveScheduledJobs,
  publicJobView,
} from '@/lib/send-job-store';
import { stripAttachmentMapForStorage, getAttachmentIdsFromMap, transferSessionFilesToJob, purgeOrphanJobFiles, claimAttachmentsForJob } from '@/lib/scheduled-attachments';
import { assertRecipientLimit } from '@/lib/temp-limits';
import { finishComposerAfterSchedule } from '@/lib/work-session';
import type { StoredScheduledJob } from '@/lib/send-utils';
import type { SendPayload } from '@/lib/send-types';
import { createId } from '@/lib/id';

export const maxDuration = 60;

export async function GET() {
  try {
    await processDueScheduledJobs();
  } catch (err) {
    console.error('processDueScheduledJobs failed:', err);
  }

  // Only remove file chunks whose parent job no longer exists.
  // Do NOT wipe session/composer files here — that races with active uploads.
  try {
    await purgeOrphanJobFiles();
  } catch (err) {
    console.error('purgeOrphanJobFiles failed:', err);
  }

  try {
    await deleteScheduledJobsByStatus(['completed']);
    const jobs = await listActiveScheduledJobs();
    return NextResponse.json({
      jobs: jobs
        .map(publicJobView)
        .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()),
    });
  } catch (err) {
    console.error('GET /api/schedule failed:', err);
    return NextResponse.json(
      { error: 'Could not load scheduled sends from database.', jobs: [] },
      { status: 503 },
    );
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { scheduledAt, label, payload } = body as {
    scheduledAt: string;
    label: string;
    payload: SendPayload;
  };

  if (!scheduledAt || !payload?.recipients?.length) {
    return NextResponse.json({ error: 'Invalid schedule request' }, { status: 400 });
  }

  try {
    assertRecipientLimit(payload.recipients.length);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }

  const when = new Date(scheduledAt);
  if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 });
  }

  const gmailToken = req.cookies.get('gmail_token')?.value;
  const outlookTokens = req.cookies.get('outlook_token')?.value;

  if (payload.useGmailApi && !gmailToken) {
    return NextResponse.json({ error: 'Gmail not connected. Sign in on step 1.' }, { status: 401 });
  }
  if (payload.useOutlookGraph && !outlookTokens) {
    return NextResponse.json({ error: 'Outlook not connected. Sign in on step 1.' }, { status: 401 });
  }

  const job: StoredScheduledJob = {
    id: createId('job_'),
    scheduledAt,
    createdAt: new Date().toISOString(),
    status: 'pending',
    label: label ?? `${payload.recipients.length} emails`,
    payload: {
      ...payload,
      attachmentMap: stripAttachmentMapForStorage(payload.attachmentMap),
    },
    totalCount: payload.recipients.length,
    sentCount: 0,
    failedCount: 0,
    ...(gmailToken ? { gmailToken } : {}),
    ...(outlookTokens ? { outlookTokens } : {}),
  };

  await createSendJob(job, 'scheduled');

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  const selectedIds = getAttachmentIdsFromMap(payload.attachmentMap);

  console.log(`[POST /api/schedule] jobId=${job.id} sessionId=${sessionId} selectedIds=${selectedIds.join(',')} attachmentMapKeys=${Object.keys(payload.attachmentMap ?? {}).join(',')}`);

  if (selectedIds.length > 0) {
    const claimed = sessionId
      ? await transferSessionFilesToJob(sessionId, job.id, selectedIds)
      : await claimAttachmentsForJob(job.id, selectedIds);

    if (claimed === 0) {
      // Roll back the job so we don't send bare emails later.
      const { deleteSendJob } = await import('@/lib/send-job-store');
      await deleteSendJob(job.id);
      return NextResponse.json(
        {
          error:
            'Attachments were not found in storage. Re-upload the files, assign them to recipients, then schedule again.',
        },
        { status: 400 },
      );
    }
  }

  if (sessionId) {
    await finishComposerAfterSchedule(sessionId, job.id);
  }

  return NextResponse.json(publicJobView(job));
}
