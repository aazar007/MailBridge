import type { Prisma, SendJob as SendJobRow } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getTokens, saveTokens, deleteTokens } from '@/lib/token-store';
import { deleteJobFiles } from '@/lib/scheduled-attachments';
import type { SendPayload } from '@/lib/send-types';
import type { SendResultItem, StoredScheduledJob } from '@/lib/send-utils';

export type SendJobKind = 'instant' | 'scheduled';

async function rowToJob(row: SendJobRow): Promise<StoredScheduledJob | null> {
  try {
    const payload = JSON.parse(row.payloadJson) as SendPayload;
    if (!Array.isArray(payload?.recipients)) return null;

    const tokens = await getTokens(row.jobId);

    return {
      id: row.jobId,
      scheduledAt: row.scheduledAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      status: row.status as StoredScheduledJob['status'],
      label: row.label,
      payload,
      gmailToken: tokens.gmailToken,
      outlookTokens: tokens.outlookTokens,
      error: row.error ?? undefined,
      results: row.resultsJson ? JSON.parse(row.resultsJson) : undefined,
      sentCount: row.sentCount,
      failedCount: row.failedCount,
      totalCount: row.totalCount || payload.recipients.length,
    };
  } catch {
    return null;
  }
}

function jobToData(job: StoredScheduledJob, kind: SendJobKind): Prisma.SendJobCreateInput {
  return {
    jobId: job.id,
    kind,
    scheduledAt: new Date(job.scheduledAt),
    createdAt: new Date(job.createdAt),
    status: job.status,
    label: job.label,
    payloadJson: JSON.stringify(job.payload),
    error: job.error ?? null,
    resultsJson: job.results ? JSON.stringify(job.results) : null,
    sentCount: job.sentCount ?? 0,
    failedCount: job.failedCount ?? 0,
    totalCount: job.totalCount ?? job.payload.recipients.length,
  };
}

export async function seedJobRecipients(
  jobId: string,
  recipients: Record<string, string>[],
): Promise<void> {
  const existing = new Set(
    (await prisma.sendRecipient.findMany({ where: { jobId }, select: { email: true } })).map((r) => r.email),
  );

  const toInsert = recipients.filter((r) => r.email && !existing.has(r.email));
  if (!toInsert.length) return;

  await prisma.sendRecipient.createMany({
    data: toInsert.map((recipient) => ({
      jobId,
      email: recipient.email,
      recipientJson: JSON.stringify(recipient),
      status: 'pending',
    })),
  });
}

export async function createSendJob(
  job: StoredScheduledJob,
  kind: SendJobKind = 'scheduled',
): Promise<void> {
  await seedJobRecipients(job.id, job.payload.recipients);
  await saveTokens(job.id, { gmailToken: job.gmailToken, outlookTokens: job.outlookTokens });

  const data = jobToData(job, kind);
  await prisma.sendJob.upsert({
    where: { jobId: job.id },
    create: data,
    update: data,
  });
}

export async function saveSendJob(job: StoredScheduledJob): Promise<void> {
  const kind: SendJobKind = job.scheduledAt && new Date(job.scheduledAt).getTime() <= Date.now() + 60_000
    ? 'instant'
    : 'scheduled';

  await saveTokens(job.id, { gmailToken: job.gmailToken, outlookTokens: job.outlookTokens });

  const data = jobToData(job, kind);
  await prisma.sendJob.updateMany({ where: { jobId: job.id }, data });
}

export async function loadSendJob(id: string): Promise<StoredScheduledJob | null> {
  const row = await prisma.sendJob.findUnique({ where: { jobId: id } });
  const job = row ? await rowToJob(row) : null;
  if (job) {
    job.results = await getJobResults(id);
  }
  return job;
}

export async function listSendJobs(): Promise<StoredScheduledJob[]> {
  const rows = await prisma.sendJob.findMany({ orderBy: { scheduledAt: 'asc' } });

  const jobs: StoredScheduledJob[] = [];
  for (const row of rows) {
    const job = await rowToJob(row);
    if (job) {
      job.results = await getJobResults(job.id);
      jobs.push(job);
    }
  }
  return jobs;
}

export async function deleteSendJob(id: string): Promise<void> {
  await prisma.sendRecipient.deleteMany({ where: { jobId: id } });
  await prisma.sendJob.deleteMany({ where: { jobId: id } });
  await deleteTokens(id);
}

export async function deleteSendJobsByStatus(
  statuses: StoredScheduledJob['status'][],
): Promise<void> {
  const jobs = await listSendJobs();
  for (const job of jobs) {
    if (statuses.includes(job.status)) {
      await deleteJobFiles(job.id);
      await deleteSendJob(job.id);
    }
  }
}

export async function listActiveSendJobs(): Promise<StoredScheduledJob[]> {
  const jobs = await listSendJobs();
  return jobs.filter(
    (job) =>
      job.status === 'pending'
      || job.status === 'processing'
      || job.status === 'partial'
      || job.status === 'failed',
  );
}

export async function getDueSendJobs(now = Date.now()): Promise<StoredScheduledJob[]> {
  const rows = await prisma.sendJob.findMany({
    where: {
      status: { in: ['pending', 'partial'] },
      scheduledAt: { lte: new Date(now) },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  const jobs: StoredScheduledJob[] = [];
  for (const row of rows) {
    const job = await rowToJob(row);
    if (job) jobs.push(job);
  }
  return jobs;
}

/**
 * Atomically claim a due job before processing it. Backed by a single
 * conditional UPDATE, so Postgres's row-level locking guarantees only one
 * concurrent caller ever sees count > 0 — the other(s) get 0 and must skip
 * the job. This is what prevents two overlapping processDueScheduledJobs()
 * runs (e.g. two open /main tabs both polling GET /api/schedule) from both
 * sending the same job's emails, since recipient statuses are otherwise only
 * written once, in a single batched call at the end of the whole send.
 */
export async function claimSendJob(jobId: string): Promise<boolean> {
  const result = await prisma.sendJob.updateMany({
    where: { jobId, status: { in: ['pending', 'partial'] } },
    data: { status: 'processing' },
  });
  return result.count > 0;
}

/**
 * Reset jobs stuck in 'processing' back to 'partial' so a crashed/killed run
 * (e.g. a timed-out function) doesn't leave a job permanently unprocessable.
 *
 * Only resets jobs whose status hasn't changed in maxAgeMs — a genuinely
 * active run keeps claimSendJob() bumping updatedAt, so this must NOT reset
 * a job that's merely mid-send. Resetting an actively-processing job here
 * would let the next poll re-claim and resend it, duplicating every email.
 */
export async function resetStaleProcessingJobs(maxAgeMs = 3 * 60_000): Promise<void> {
  const processing = await prisma.sendJob.findMany({
    where: { status: 'processing', updatedAt: { lt: new Date(Date.now() - maxAgeMs) } },
  });
  if (!processing.length) return;

  await prisma.$transaction(
    processing.map((r) =>
      prisma.sendJob.update({
        where: { jobId: r.jobId },
        data: { status: 'partial', error: r.error || 'Resuming after interruption' },
      }),
    ),
  );
}

export async function getPendingRecipients(jobId: string): Promise<Record<string, string>[]> {
  const rows = await prisma.sendRecipient.findMany({
    where: { jobId, status: 'pending' },
    orderBy: { id: 'asc' },
  });
  return rows.map((r) => JSON.parse(r.recipientJson));
}

export async function markRecipientSent(jobId: string, email: string): Promise<void> {
  await applyRecipientResults(jobId, [{ email, status: 'sent' }]);
}

export async function markRecipientFailed(
  jobId: string,
  email: string,
  error: string,
): Promise<void> {
  await applyRecipientResults(jobId, [{ email, status: 'failed', error }]);
}

export interface RecipientResult {
  email: string;
  status: 'sent' | 'failed';
  error?: string;
}

/**
 * Batched equivalent of calling markRecipientSent/Failed once per recipient —
 * one transaction for the whole tick's worth of recipient outcomes, plus a
 * single counter update on the job row.
 */
export async function applyRecipientResults(jobId: string, results: RecipientResult[]): Promise<void> {
  if (!results.length) return;
  const now = new Date();

  await prisma.$transaction(
    results.map((result) =>
      prisma.sendRecipient.updateMany({
        where: { jobId, email: result.email },
        data: result.status === 'sent'
          ? { status: 'sent', sentAt: now, error: null }
          : { status: 'failed', error: result.error ?? null },
      }),
    ),
  );

  const sentDelta = results.filter((r) => r.status === 'sent').length;
  const failedDelta = results.filter((r) => r.status === 'failed').length;

  await prisma.sendJob.updateMany({
    where: { jobId },
    data: { sentCount: { increment: sentDelta }, failedCount: { increment: failedDelta } },
  });
}

export async function getJobStats(jobId: string): Promise<{
  sent: number;
  failed: number;
  pending: number;
  total: number;
}> {
  const [sent, failed, total] = await Promise.all([
    prisma.sendRecipient.count({ where: { jobId, status: 'sent' } }),
    prisma.sendRecipient.count({ where: { jobId, status: 'failed' } }),
    prisma.sendRecipient.count({ where: { jobId } }),
  ]);
  return { sent, failed, pending: total - sent - failed, total };
}

export async function getJobResults(jobId: string): Promise<SendResultItem[]> {
  const rows = await prisma.sendRecipient.findMany({
    where: { jobId, status: { not: 'pending' } },
    orderBy: { id: 'asc' },
  });
  return rows.map((r) => ({
    email: r.email,
    success: r.status === 'sent',
    error: r.error ?? undefined,
  }));
}

export interface LegacyCleanupResult {
  deletedSentRecipients: number;
  deletedFailedRecipients: number;
  deletedStaleJobs: number;
}

/**
 * Daily retention sweep for the legacy send_jobs/send_recipients tables
 * (same 24h-sent / 30d-failed / 7d-stale-job rules as campaign-store's
 * runDailyCleanup()).
 */
export async function runLegacyCleanup(): Promise<LegacyCleanupResult> {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const sentStale = await prisma.sendRecipient.deleteMany({
    where: { status: 'sent', sentAt: { lt: cutoff24h } },
  });
  const failedStale = await prisma.sendRecipient.deleteMany({
    where: { status: { in: ['failed', 'error'] }, sentAt: { lt: cutoff30d } },
  });

  const remainingJobIds = new Set(
    (await prisma.sendRecipient.findMany({ select: { jobId: true }, distinct: ['jobId'] })).map((r) => r.jobId),
  );
  const staleJobs = await prisma.sendJob.findMany({
    where: {
      status: { in: ['completed', 'failed'] },
      createdAt: { lt: cutoff7d },
    },
  });
  const trulyStale = staleJobs.filter((r) => !remainingJobIds.has(r.jobId));
  if (trulyStale.length) {
    await prisma.sendJob.deleteMany({ where: { jobId: { in: trulyStale.map((r) => r.jobId) } } });
    for (const job of trulyStale) await deleteTokens(job.jobId);
  }

  return {
    deletedSentRecipients: sentStale.count,
    deletedFailedRecipients: failedStale.count,
    deletedStaleJobs: trulyStale.length,
  };
}

export function publicJobView(job: StoredScheduledJob) {
  return {
    id: job.id,
    scheduledAt: job.scheduledAt,
    createdAt: job.createdAt,
    status: job.status,
    label: job.label,
    error: job.error,
    recipientCount: job.totalCount ?? job.payload.recipients.length,
    sentCount: job.sentCount ?? 0,
    failedCount: job.failedCount ?? 0,
    pendingCount: Math.max(
      0,
      (job.totalCount ?? job.payload.recipients.length)
        - (job.sentCount ?? 0)
        - (job.failedCount ?? 0),
    ),
    results: job.results,
  };
}

// Backward-compatible aliases
export {
  loadSendJob as loadScheduledJob,
  saveSendJob as saveScheduledJob,
  deleteSendJob as deleteScheduledJob,
  deleteSendJobsByStatus as deleteScheduledJobsByStatus,
  listActiveSendJobs as listActiveScheduledJobs,
  getDueSendJobs as getDueScheduledJobs,
};
