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

// Scheduled-send chunking: rather than sending continuously across back-to-
// back polls (which, even paced by delayMs, still looks like one continuous
// automated burst to a provider watching send patterns), a job sends at
// most CHUNK_SIZE recipients per run, then rests CHUNK_GAP_MS before the
// next chunk is picked up — regardless of how much time-budget is left.
export const CHUNK_SIZE = 10;
export const CHUNK_GAP_MS = 3 * 60_000;

export interface RunSendJobResult {
  batchResults: SendResultItem[];
  done: boolean;
  stats: { sent: number; failed: number; pending: number; total: number };
}
