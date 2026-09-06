import {
  claimSendJob,
  deleteSendJob,
  getDueSendJobs,
  getJobResults,
  getJobStats,
  resetStaleProcessingJobs,
  saveSendJob,
} from '@/lib/send-job-store';
import { hydrateScheduledAttachmentMap } from '@/lib/scheduled-attachments';
import { runSendJob } from '@/lib/run-send';
import { SEND_TIME_BUDGET_MS } from '@/lib/send-job-types';
import type { StoredScheduledJob } from '@/lib/send-utils';

export async function processDueScheduledJobs(): Promise<{
  processed: number;
  ids: string[];
  // The mutated in-memory job as of right after processing — a caller (e.g.
  // instant send's live-count polling) can read a job's fresh sentCount/
  // status/results here even though a 'completed' job gets deleted shortly
  // after by GET /api/schedule's own poll cycle.
  jobs: StoredScheduledJob[];
}> {
  await resetStaleProcessingJobs();
  const due = await getDueSendJobs();
  const ids: string[] = [];
  const jobs: StoredScheduledJob[] = [];
  const started = Date.now();

  for (const job of due) {
    // runSendJob() budgets itself internally, but that's per-job — with
    // several due jobs in one tick, each budgeting independently could
    // still add up past this whole function's Vercel maxDuration. Stop
    // starting new jobs once the shared budget is spent; whatever's left
    // picks up on the next poll, same as an individual job's own resume.
    if (Date.now() - started >= SEND_TIME_BUDGET_MS) break;

    // Atomically claim the job first — if another concurrent invocation
    // (e.g. an overlapping poll from a second open tab) already claimed it,
    // this returns false and we must not process it again.
    const claimed = await claimSendJob(job.id);
    if (!claimed) continue;
    job.status = 'processing';

    try {
      const attachmentMap = await hydrateScheduledAttachmentMap(job.payload.attachmentMap);
      const remainingSharedBudget = SEND_TIME_BUDGET_MS - (Date.now() - started);
      const { done, stats } = await runSendJob(
        {
          jobId: job.id,
          payload: { ...job.payload, attachmentMap },
          gmailToken: job.gmailToken,
          outlookTokens: job.outlookTokens,
        },
        remainingSharedBudget,
      );

      job.sentCount = stats.sent;
      job.failedCount = stats.failed;
      job.totalCount = stats.total;
      job.results = await getJobResults(job.id);

      if (!done) {
        job.status = 'partial';
        job.error = `${stats.sent} sent, ${stats.failed} failed, ${stats.pending} remaining — pausing briefly between chunks, will continue automatically`;
      } else if (stats.failed === stats.total) {
        job.status = 'failed';
        job.error = job.results.find((r) => !r.success)?.error ?? 'All sends failed';
      } else {
        job.status = 'completed';
        if (stats.failed > 0) {
          job.error = `${stats.failed} of ${stats.total} failed`;
        } else {
          job.error = undefined;
        }
      }
    } catch (err) {
      job.status = 'failed';
      job.error = String(err);
    }

    await saveSendJob(job);
    ids.push(job.id);
    jobs.push(job);

    // Deliberately NOT cleaning up a 'completed' job here (no
    // finalizeScheduledJob call) — a caller polling this job (e.g. instant
    // send's live count) needs a window to observe its final sentCount/
    // status before it's gone. GET /api/schedule's own poll cycle already
    // calls deleteScheduledJobsByStatus(['completed']) shortly after, which
    // does the same cleanup (job files + job row) once that window has passed.
  }

  return { processed: ids.length, ids, jobs };
}
