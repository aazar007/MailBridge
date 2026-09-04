import type { EmailAttachment } from '@/lib/send-types';
import {
  getSafeAttachmentContentType,
  getSafeAttachmentFilename,
  splitAttachmentContent,
} from '@/lib/attachments';
import { runPool } from '@/lib/upload-pool';

const FILES_API = '/api/session/files';
// Each batch now costs ~1-3 Sheets API calls (was up to 8) since the backend
// bulk-saves a whole batch in one read + one write. Still cap concurrency —
// Sheets' per-minute quota is shared across every user of this app.
const UPLOAD_CONCURRENCY = 4;
const CHUNKS_PER_BATCH = 4;

interface ChunkTask {
  attachmentId: string;
  sessionId?: string;
  chunkIndex: number;
  chunkCount: number;
  filename: string;
  contentType: string;
  content: string;
  createdAt: string;
}

function buildChunkTasks(file: EmailAttachment, sessionId?: string): ChunkTask[] {
  const chunks = splitAttachmentContent(file.content);
  const contentType = getSafeAttachmentContentType(file.contentType);
  const filename = getSafeAttachmentFilename(file.filename, contentType);
  const createdAt = new Date().toISOString();

  return chunks.map((content, chunkIndex) => ({
    attachmentId: file.id,
    sessionId,
    chunkIndex,
    chunkCount: chunks.length,
    filename,
    contentType,
    content,
    createdAt,
  }));
}

async function postChunkBatch(tasks: ChunkTask[]): Promise<void> {
  const res = await fetch(FILES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunks: tasks }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = body.reason ? `: ${body.reason}` : '';
    throw new Error((body.error ?? `Failed to upload ${tasks[0]?.filename ?? 'file'}`) + detail);
  }
}

export async function uploadAttachmentToTurso(
  file: EmailAttachment,
  sessionId?: string,
): Promise<void> {
  await uploadAttachmentsParallel([file], undefined, sessionId);
}

export async function uploadAttachmentsParallel(
  files: EmailAttachment[],
  onProgress?: (done: number, total: number) => void,
  sessionId?: string,
): Promise<void> {
  const batchTasks: ChunkTask[][] = [];

  for (const file of files) {
    const tasks = buildChunkTasks(file, sessionId);
    for (let i = 0; i < tasks.length; i += CHUNKS_PER_BATCH) {
      batchTasks.push(tasks.slice(i, i + CHUNKS_PER_BATCH));
    }
  }

  const total = batchTasks.length;
  let done = 0;
  onProgress?.(0, total);

  await runPool(batchTasks, UPLOAD_CONCURRENCY, async (batch) => {
    await postChunkBatch(batch);
    done += 1;
    onProgress?.(done, total);
  });
}

export async function deleteAttachmentsFromTurso(attachmentIds: string[]): Promise<void> {
  if (attachmentIds.length === 0) return;
  await fetch(FILES_API, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attachmentIds }),
  });
}

export function estimateUploadBatches(file: EmailAttachment): number {
  const chunks = splitAttachmentContent(file.content);
  return Math.ceil(chunks.length / CHUNKS_PER_BATCH) || 1;
}

export function attachmentMetadataOnly(file: EmailAttachment): EmailAttachment {
  return {
    id: file.id,
    filename: file.filename,
    contentType: file.contentType,
    content: '',
  };
}
