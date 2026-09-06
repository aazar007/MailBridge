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

export async function fetchScheduledJobs(): Promise<PublicScheduledJob[]> {
  const res = await fetch('/api/schedule', { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 503) return data.jobs ?? [];
  if (!res.ok) throw new Error(data.error ?? 'Failed to load scheduled sends');
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
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to schedule send');
  return data;
}

/** Pure read of one job's current progress — used to poll an instant send's
 *  live sent/failed count without re-fetching the whole active-jobs list. */
export async function fetchScheduledJob(id: string): Promise<PublicScheduledJob | null> {
  const res = await fetch(`/api/schedule/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to load send status');
  return data;
}

export async function updateScheduledJobTime(id: string, scheduledAt: string): Promise<PublicScheduledJob> {
  const res = await fetch(`/api/schedule/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduledAt }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed to update schedule');
  return data;
}

export async function cancelScheduledJob(id: string): Promise<void> {
  const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Failed to cancel schedule');
  }
}
