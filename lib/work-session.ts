import { prisma } from '@/lib/prisma';
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

export async function saveWorkSession(
  sessionId: string,
  data: WorkSessionData,
): Promise<void> {
  assertRecipientLimit(data.recipients.length);

  await prisma.workSession.upsert({
    where: { sessionId },
    create: { sessionId, payloadJson: JSON.stringify(data) },
    update: { payloadJson: JSON.stringify(data) },
  });
}

export async function loadWorkSession(sessionId: string): Promise<WorkSessionData | null> {
  const row = await prisma.workSession.findUnique({ where: { sessionId } });
  if (!row?.payloadJson) return null;
  return JSON.parse(row.payloadJson) as WorkSessionData;
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

  await prisma.workSession.deleteMany({ where: { sessionId } });
}

export async function clearWorkSessionRecord(sessionId: string): Promise<void> {
  await prisma.workSession.deleteMany({ where: { sessionId } });
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
