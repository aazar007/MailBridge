import type { SendResultItem, StoredScheduledJob } from '@/lib/send-utils';

export const SEND_TIME_BUDGET_MS = 50_000;
export const STALE_PROCESSING_MS = 3 * 60_000;

export interface RunSendJobResult {
  batchResults: SendResultItem[];
  done: boolean;
  stats: { sent: number; failed: number; pending: number; total: number };
}
