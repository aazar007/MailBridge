import type { SendPayload } from '@/lib/send-types';

export interface PublicScheduledJob {
  id: string;
  scheduledAt: string;
  createdAt: string;
  status: 'pending' | 'processing' | 'partial' | 'completed' | 'failed';
  label: string;
  error?: string;
  recipientCount: number;
  sentCount?: number;
  failedCount?: number;
  pendingCount?: number;
  results?: { email: string; success: boolean; error?: string }[];
}

/** Parse a JSON response without throwing on an empty/non-JSON body (e.g. a bare
 *  500 from a crashed route) so callers surface a readable error instead of
 *  "Unexpected end of JSON input". */
async function readJson(res: Response): Promise<any> {
  const text = await res.text().catch(() => '');
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

function httpError(res: Response, data: { error?: string }, fallback: string): Error {
  return new Error(data.error ?? `${fallback} (server returned ${res.status})`);
}

export async function fetchScheduledJobs(): Promise<PublicScheduledJob[]> {
  const res = await fetch('/api/schedule', { cache: 'no-store' });
  const data = await readJson(res);
  if (res.status === 503) return data.jobs ?? [];
  if (!res.ok) throw httpError(res, data, 'Failed to load scheduled sends');
  return data.jobs ?? [];
}

export async function createScheduledJob(input: {
  scheduledAt: string;
  label: string;
  payload: SendPayload;
  sessionId?: string;
  instant?: boolean;
}): Promise<PublicScheduledJob> {
  const res = await fetch('/api/schedule', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await readJson(res);
  if (!res.ok) throw httpError(res, data, 'Failed to schedule send');
  return data;
}

/** Pure read of one job's current progress — used to poll an instant send's
 *  live sent/failed count without re-fetching the whole active-jobs list. */
export async function fetchScheduledJob(id: string): Promise<PublicScheduledJob | null> {
  const res = await fetch(`/api/schedule/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  const data = await readJson(res);
  if (!res.ok) throw httpError(res, data, 'Failed to load send status');
  return data;
}

export async function updateScheduledJobTime(id: string, scheduledAt: string): Promise<PublicScheduledJob> {
  const res = await fetch(`/api/schedule/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduledAt }),
  });
  const data = await readJson(res);
  if (!res.ok) throw httpError(res, data, 'Failed to update schedule');
  return data;
}

export async function cancelScheduledJob(id: string): Promise<void> {
  const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await readJson(res);
    throw httpError(res, data, 'Failed to cancel schedule');
  }
}
