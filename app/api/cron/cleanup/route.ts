/**
 * GET /api/cron/cleanup
 *
 * Cron Job 2 — Daily data retention sweep (recommended: 3 AM UTC).
 *
 * Schedule in vercel.json: "0 3 * * *"
 *
 * Retention policy for Sheets-backed campaign/job rows:
 *
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │  Status    │ Retention  │ Reason                             │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  sent      │  24 hours  │ Stats preserved in campaigns.      │
 *   │            │            │ sent_count — row data redundant.   │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  failed    │  30 days   │ Users need time to view errors and │
 *   │  / error   │            │ decide whether to retry.           │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  campaigns │  7 days    │ Deleted only when no recipients    │
 *   │  (stale)   │  post-done │ remain; aggregate stats stay.      │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │  campaign_ │  cascade   │ Deleted when parent campaign is    │
 *   │  attachments│           │ removed — no orphan URL rows.      │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Also cleans up the Sheets `files_handler` tab (temporary base64 chunks).
 */

import { NextRequest, NextResponse } from 'next/server';
import { runDailyCleanup }           from '@/lib/campaign-store';
import { runLegacyCleanup }          from '@/lib/send-job-store';
import { emptyComposerFiles }        from '@/lib/scheduled-attachments';

export const maxDuration = 60;

function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV === 'development';
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const started = Date.now();
  const report: Record<string, unknown> = {};

  // ── 1. Campaign recipients retention sweep ──────────────────────────────────
  try {
    const cleanup = await runDailyCleanup();
    report.campaigns = cleanup;
  } catch (err) {
    report.campaigns_error = String(err);
    console.error('[cron:cleanup] campaign cleanup error:', err);
  }

  // ── 2. Legacy send_recipients retention sweep ───────────────────────────────
  //    Applies the same rules (24 h sent / 30 d failed) to the older table
  //    (now Sheets-backed) so jobs that existed before the campaign upgrade
  //    are also purged.
  try {
    report.legacy = await runLegacyCleanup();
  } catch (err) {
    report.legacy_error = String(err);
    console.error('[cron:cleanup] legacy cleanup error:', err);
  }

  // ── 3. files_handler sweep (Sheets) ─────────────────────────────────────────
  //    Temporary base64 chunks used during composition.
  //    Should be empty between sends; this is a safety net for orphaned rows.
  //    emptyComposerFiles() never wipes chunks linked to a pending job.
  try {
    const removed = await emptyComposerFiles();
    report.files_handler = { removed };
  } catch (err) {
    report.files_handler_error = String(err);
    console.error('[cron:cleanup] files_handler cleanup error:', err);
  }

  return NextResponse.json({
    ok:         true,
    elapsed_ms: Date.now() - started,
    ...report,
  });
}
