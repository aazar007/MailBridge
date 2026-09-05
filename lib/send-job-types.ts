import type { SendResultItem, StoredScheduledJob } from '@/lib/send-utils';

// Vercel's maxDuration on /api/schedule is 60s. This must leave enough
// margin for everything that runs AFTER the send loop but still inside that
// same 60s: applyRecipientResults + getJobStats (end of runSendJob),
// getJobResults + saveSendJob (end of processDueScheduledJobs' per-job
// loop) — and if there are several due jobs, that repeats per job — plus
// the route's own purgeOrphanJobFiles/deleteScheduledJobsByStatus/
// listActiveScheduledJobs calls after processDueScheduledJobs() returns.
// Measured against the live Postgres pooled connection, that trailing work
// alone took ~8.5s in one run — a 50s budget (10s margin) was too tight.
export const SEND_TIME_BUDGET_MS = 30_000;
export const STALE_PROCESSING_MS = 3 * 60_000;

export interface RunSendJobResult {
  batchResults: SendResultItem[];
  done: boolean;
  stats: { sent: number; failed: number; pending: number; total: number };
}
