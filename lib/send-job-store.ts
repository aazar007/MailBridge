import * as sheets from '@/lib/sheetsClient';
import { getTokens, saveTokens, deleteTokens } from '@/lib/token-store';
import { deleteJobFiles } from '@/lib/scheduled-attachments';
import type { SendPayload } from '@/lib/send-types';
import type { SendResultItem, StoredScheduledJob } from '@/lib/send-utils';

const JOBS_TAB = 'send_jobs';
const RECIPIENTS_TAB = 'send_recipients';

export type SendJobKind = 'instant' | 'scheduled';

async function rowToJob(row: sheets.SheetRow): Promise<StoredScheduledJob | null> {
  try {
    if (!row.job_id || !row.payload_json) return null;
    const payload = JSON.parse(row.payload_json as string) as SendPayload;
    if (!Array.isArray(payload?.recipients)) return null;

    const tokens = await getTokens(row.job_id as string);

    return {
      id: row.job_id as string,
      scheduledAt: (row.scheduled_at as string) ?? new Date().toISOString(),
      createdAt: (row.created_at as string) ?? new Date().toISOString(),
      status: (row.status as StoredScheduledJob['status']) ?? 'pending',
      label: (row.label as string) ?? 'Send job',
      payload,
      gmailToken: tokens.gmailToken,
      outlookTokens: tokens.outlookTokens,
      error: (row.error as string | undefined) || undefined,
      results: row.results_json ? JSON.parse(row.results_json as string) : undefined,
      sentCount: Number(row.sent_count ?? 0),
      failedCount: Number(row.failed_count ?? 0),
      totalCount: Number(row.total_count ?? payload.recipients.length),
    };
  } catch {
    return null;
  }
}

function jobToRow(job: StoredScheduledJob, kind: SendJobKind, existingId?: number) {
  return {
    id: existingId,
    job_id: job.id,
    kind,
    scheduled_at: job.scheduledAt,
    created_at: job.createdAt,
    status: job.status,
    label: job.label,
    payload_json: JSON.stringify(job.payload),
    error: job.error ?? '',
    results_json: job.results ? JSON.stringify(job.results) : '',
    sent_count: job.sentCount ?? 0,
    failed_count: job.failedCount ?? 0,
    total_count: job.totalCount ?? job.payload.recipients.length,
  };
}

export async function seedJobRecipients(
  jobId: string,
  recipients: Record<string, string>[],
): Promise<void> {
  const rows = await sheets.getRows(RECIPIENTS_TAB);
  const existing = new Set(
    rows.filter((r) => r.job_id === jobId).map((r) => r.email as string),
  );

  const toInsert = recipients.filter((r) => r.email && !existing.has(r.email));
  if (!toInsert.length) return;

  let nextId = await sheets.nextId(RECIPIENTS_TAB);
  const newRows = toInsert.map((recipient) => ({
    id: nextId++,
    job_id: jobId,
    email: recipient.email,
    recipient_json: JSON.stringify(recipient),
    status: 'pending',
    error: '',
    sent_at: '',
  }));
  await sheets.appendRows(RECIPIENTS_TAB, newRows);
}

export async function createSendJob(
  job: StoredScheduledJob,
  kind: SendJobKind = 'scheduled',
): Promise<void> {
  await seedJobRecipients(job.id, job.payload.recipients);
  await saveTokens(job.id, { gmailToken: job.gmailToken, outlookTokens: job.outlookTokens });

  const rows = await sheets.getRows(JOBS_TAB);
  const existing = rows.find((r) => r.job_id === job.id);

  if (existing) {
    await sheets.updateRow(JOBS_TAB, existing._row, jobToRow(job, kind, Number(existing.id)));
  } else {
    const id = await sheets.nextId(JOBS_TAB);
    await sheets.appendRow(JOBS_TAB, jobToRow(job, kind, id));
  }
}

export async function saveSendJob(job: StoredScheduledJob): Promise<void> {
  const kind: SendJobKind = job.scheduledAt && new Date(job.scheduledAt).getTime() <= Date.now() + 60_000
    ? 'instant'
    : 'scheduled';

  await saveTokens(job.id, { gmailToken: job.gmailToken, outlookTokens: job.outlookTokens });

  const rows = await sheets.getRows(JOBS_TAB);
  const existing = rows.find((r) => r.job_id === job.id);
  if (!existing) return;
  await sheets.updateRow(JOBS_TAB, existing._row, jobToRow(job, kind, Number(existing.id)));
}

export async function loadSendJob(id: string): Promise<StoredScheduledJob | null> {
  const rows = await sheets.getRows(JOBS_TAB);
  const row = rows.find((r) => r.job_id === id);
  const job = row ? await rowToJob(row) : null;
  if (job) {
    job.results = await getJobResults(id);
  }
  return job;
}

export async function listSendJobs(): Promise<StoredScheduledJob[]> {
  const rows = await sheets.getRows(JOBS_TAB);
  const sorted = [...rows].sort((a, b) =>
    String(a.scheduled_at).localeCompare(String(b.scheduled_at)),
  );

  const jobs: StoredScheduledJob[] = [];
  for (const row of sorted) {
    const job = await rowToJob(row);
    if (job) {
      job.results = await getJobResults(job.id);
      jobs.push(job);
    }
  }
  return jobs;
}

export async function deleteSendJob(id: string): Promise<void> {
  const recipientRows = await sheets.getRows(RECIPIENTS_TAB);
  const matches = recipientRows.filter((r) => r.job_id === id);
  if (matches.length) await sheets.deleteRows(RECIPIENTS_TAB, matches.map((r) => r._row));

  const jobRows = await sheets.getRows(JOBS_TAB);
  const jobRow = jobRows.find((r) => r.job_id === id);
  if (jobRow) await sheets.deleteRows(JOBS_TAB, [jobRow._row]);

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
  const rows = await sheets.getRows(JOBS_TAB);
  const nowIso = new Date(now).toISOString();
  const due = rows
    .filter((r) => (r.status === 'pending' || r.status === 'partial') && String(r.scheduled_at) <= nowIso)
    .sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));

  const jobs: StoredScheduledJob[] = [];
  for (const row of due) {
    const job = await rowToJob(row);
    if (job) jobs.push(job);
  }
  return jobs;
}

export async function resetStaleProcessingJobs(_maxAgeMs = 3 * 60_000): Promise<void> {
  const rows = await sheets.getRows(JOBS_TAB);
  const processing = rows.filter((r) => r.status === 'processing');
  if (!processing.length) return;

  await sheets.batchUpdateRows(
    JOBS_TAB,
    processing.map((r) => ({
      row: r._row,
      obj: { ...r, status: 'partial', error: r.error || 'Resuming after interruption' },
    })),
  );
}

export async function getPendingRecipients(jobId: string): Promise<Record<string, string>[]> {
  const rows = await sheets.getRows(RECIPIENTS_TAB);
  return rows
    .filter((r) => r.job_id === jobId && r.status === 'pending')
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((r) => JSON.parse(r.recipient_json as string));
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
 * Batched equivalent of calling markRecipientSent/Failed once per recipient.
 * A live run of runSendJob() against a real Sheet showed the per-recipient
 * version burning through Google's 60-reads/min quota on just a couple of
 * recipients (each call did 2 reads + 2 writes). This does the whole job's
 * worth of recipient status updates in one batched write, plus a single
 * read+write for the job's sent_count/failed_count — O(1) Sheets calls
 * regardless of recipient count, not O(n).
 */
export async function applyRecipientResults(jobId: string, results: RecipientResult[]): Promise<void> {
  if (!results.length) return;
  const now = new Date().toISOString();

  const rows = await sheets.getRows(RECIPIENTS_TAB);
  const byEmail = new Map(results.map((r) => [r.email, r]));
  const updates = rows
    .filter((r) => r.job_id === jobId && byEmail.has(r.email as string))
    .map((r) => {
      const result = byEmail.get(r.email as string)!;
      return {
        row: r._row,
        obj: result.status === 'sent'
          ? { ...r, status: 'sent', sent_at: now, error: '' }
          : { ...r, status: 'failed', error: result.error ?? '' },
      };
    });
  if (updates.length) await sheets.batchUpdateRows(RECIPIENTS_TAB, updates);

  const sentDelta = results.filter((r) => r.status === 'sent').length;
  const failedDelta = results.filter((r) => r.status === 'failed').length;

  const jobRows = await sheets.getRows(JOBS_TAB);
  const jobRow = jobRows.find((r) => r.job_id === jobId);
  if (jobRow) {
    await sheets.updateRow(JOBS_TAB, jobRow._row, {
      ...jobRow,
      sent_count: Number(jobRow.sent_count ?? 0) + sentDelta,
      failed_count: Number(jobRow.failed_count ?? 0) + failedDelta,
    });
  }
}

export async function getJobStats(jobId: string): Promise<{
  sent: number;
  failed: number;
  pending: number;
  total: number;
}> {
  const rows = await sheets.getRows(RECIPIENTS_TAB);
  const jobRows = rows.filter((r) => r.job_id === jobId);
  let sent = 0;
  let failed = 0;
  let pending = 0;
  for (const r of jobRows) {
    if (r.status === 'sent') sent++;
    else if (r.status === 'failed') failed++;
    else pending++;
  }
  return { sent, failed, pending, total: jobRows.length };
}

export async function getJobResults(jobId: string): Promise<SendResultItem[]> {
  const rows = await sheets.getRows(RECIPIENTS_TAB);
  return rows
    .filter((r) => r.job_id === jobId && r.status !== 'pending')
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((r) => ({
      email: r.email as string,
      success: r.status === 'sent',
      error: (r.error as string | undefined) || undefined,
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
 * runDailyCleanup()). Runs once/day, so the extra reads here vs. a single
 * SQL statement are fine.
 */
export async function runLegacyCleanup(): Promise<LegacyCleanupResult> {
  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const recipientRows = await sheets.getRows(RECIPIENTS_TAB);
  const sentStale = recipientRows.filter((r) => r.status === 'sent' && r.sent_at && String(r.sent_at) < cutoff24h);
  const failedStale = recipientRows.filter(
    (r) => (r.status === 'failed' || r.status === 'error') && r.sent_at && String(r.sent_at) < cutoff30d,
  );
  const toDelete = [...sentStale, ...failedStale];
  if (toDelete.length) await sheets.deleteRows(RECIPIENTS_TAB, toDelete.map((r) => r._row));

  const remainingJobIds = new Set((await sheets.getRows(RECIPIENTS_TAB)).map((r) => String(r.job_id)));
  const jobRows = await sheets.getRows(JOBS_TAB);
  const staleJobs = jobRows.filter(
    (r) =>
      (r.status === 'completed' || r.status === 'failed') &&
      String(r.created_at) < cutoff7d &&
      !remainingJobIds.has(String(r.job_id)),
  );
  if (staleJobs.length) {
    await sheets.deleteRows(JOBS_TAB, staleJobs.map((r) => r._row));
    for (const job of staleJobs) await deleteTokens(String(job.job_id));
  }

  return {
    deletedSentRecipients: sentStale.length,
    deletedFailedRecipients: failedStale.length,
    deletedStaleJobs: staleJobs.length,
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
