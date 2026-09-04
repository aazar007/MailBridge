import * as sheets from '@/lib/sheetsClient';
import { deleteSendJob } from '@/lib/send-job-store';
import {
  deleteComposerStorage,
  deleteJobFiles,
  emptyComposerFiles,
  getAttachmentIdsFromFileList,
} from '@/lib/scheduled-attachments';
import { assertRecipientLimit } from '@/lib/temp-limits';
import type { EmailAttachment } from '@/lib/send-types';

export interface WorkSessionData {
  recipients: Record<string, string>[];
  columns: string[];
  attachmentAssignments: Record<string, string[]>;
  attachmentFiles: Array<Pick<EmailAttachment, 'id' | 'filename' | 'contentType'>>;
}

const TAB = 'work_sessions';

export async function saveWorkSession(
  sessionId: string,
  data: WorkSessionData,
): Promise<void> {
  assertRecipientLimit(data.recipients.length);

  const now = new Date().toISOString();
  const rows = await sheets.getRows(TAB);
  const existing = rows.find((r) => r.session_id === sessionId);
  const row = { session_id: sessionId, payload_json: JSON.stringify(data), created_at: existing?.created_at ?? now, updated_at: now };

  if (existing) {
    await sheets.updateRow(TAB, existing._row, row);
  } else {
    await sheets.appendRow(TAB, row);
  }
}

export async function loadWorkSession(sessionId: string): Promise<WorkSessionData | null> {
  const rows = await sheets.getRows(TAB);
  const row = rows.find((r) => r.session_id === sessionId);
  if (!row?.payload_json) return null;
  return JSON.parse(row.payload_json as string) as WorkSessionData;
}

/** Remove draft session uploads and wipe composer files from storage. */
export async function deleteWorkSession(
  sessionId: string,
  extraAttachmentIds: string[] = [],
): Promise<void> {
  const session = await loadWorkSession(sessionId);
  const fileIds = [
    ...new Set([
      ...getAttachmentIdsFromFileList(session?.attachmentFiles),
      ...extraAttachmentIds.filter(Boolean),
    ]),
  ];

  await deleteComposerStorage(sessionId, fileIds);
  // Use emptyComposerFiles so job-linked attachment files are never wiped.
  await emptyComposerFiles();

  const rows = await sheets.getRows(TAB);
  const row = rows.find((r) => r.session_id === sessionId);
  if (row) await sheets.deleteRows(TAB, [row._row]);
}

export async function clearWorkSessionRecord(sessionId: string): Promise<void> {
  const rows = await sheets.getRows(TAB);
  const row = rows.find((r) => r.session_id === sessionId);
  if (row) await sheets.deleteRows(TAB, [row._row]);
}

/** After scheduling: clear the work session record. */
export async function finishComposerAfterSchedule(
  sessionId: string,
  _activeJobId?: string,
): Promise<void> {
  await clearWorkSessionRecord(sessionId);
}

export async function finalizeScheduledJob(
  jobId: string,
  _attachmentMap: Record<string, EmailAttachment[]> | undefined,
): Promise<void> {
  await deleteJobFiles(jobId);
  await deleteSendJob(jobId);
  await emptyComposerFiles();
}
