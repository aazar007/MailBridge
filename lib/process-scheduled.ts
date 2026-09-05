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
import { finalizeScheduledJob } from '@/lib/work-session';
import { runSendJob } from '@/lib/run-send';

export async function processDueScheduledJobs(): Promise<{ processed: number; ids: string[] }> {
  await resetStaleProcessingJobs();
  const due = await getDueSendJobs();
  const ids: string[] = [];

  for (const job of due) {
    // Atomically claim the job first — if another concurrent invocation
    // (e.g. an overlapping poll from a second open tab) already claimed it,
    // this returns false and we must not process it again.
    const claimed = await claimSendJob(job.id);
    if (!claimed) continue;
    job.status = 'processing';

    try {
      const attachmentMap = await hydrateScheduledAttachmentMap(job.payload.attachmentMap);
      const { done, stats } = await runSendJob({
        jobId: job.id,
        payload: { ...job.payload, attachmentMap },
        gmailToken: job.gmailToken,
        outlookTokens: job.outlookTokens,
      });

      job.sentCount = stats.sent;
      job.failedCount = stats.failed;
      job.totalCount = stats.total;
      job.results = await getJobResults(job.id);

      if (!done) {
        job.status = 'partial';
        job.error = `${stats.sent} sent, ${stats.failed} failed, ${stats.pending} remaining — will continue automatically`;
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

    if (job.status === 'completed') {
      await finalizeScheduledJob(job.id, job.payload.attachmentMap);
    }
  }

  return { processed: ids.length, ids };
}
