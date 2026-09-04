/**
 * Attachment chunk storage — Google Sheets tab `files_handler`.
 * Chunks are ≤ ~40k chars so they fit Sheets cell limits (~50k).
 * Falls back to in-memory Maps when Sheets env vars are missing (local/dev).
 */

import * as sheets from '@/lib/sheetsClient';
import { assertFileLimit } from '@/lib/temp-limits';
import type { EmailAttachment } from '@/lib/send-types';

export interface StoredAttachmentChunk {
  attachmentId: string;
  sessionId?: string;
  jobId?: string;
  chunkIndex: number;
  chunkCount: number;
  filename: string;
  contentType: string;
  content: string;
  createdAt: string;
}

const TAB = 'files_handler' as const;
const memoryChunks = new Map<string, Map<number, StoredAttachmentChunk>>();

function sheetsConfigured(): boolean {
  return !!(
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim()
    && process.env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim()
    && process.env.GOOGLE_SHEETS_PRIVATE_KEY?.trim()
  );
}

function rowToChunk(r: sheets.SheetRow): StoredAttachmentChunk {
  return {
    attachmentId: String(r.attachment_id ?? ''),
    sessionId: r.session_id ? String(r.session_id) : undefined,
    jobId: r.job_id ? String(r.job_id) : undefined,
    chunkIndex: Number(r.chunk_index) || 0,
    chunkCount: Number(r.chunk_count) || 1,
    filename: String(r.filename ?? ''),
    contentType: String(r.content_type ?? 'application/octet-stream'),
    content: String(r.content_base64 ?? ''),
    createdAt: String(r.created_at ?? ''),
  };
}

function chunkToRow(chunk: StoredAttachmentChunk, id: number | string): Record<string, unknown> {
  return {
    id,
    attachment_id: chunk.attachmentId,
    session_id: chunk.sessionId ?? '',
    job_id: chunk.jobId ?? '',
    chunk_index: chunk.chunkIndex,
    chunk_count: chunk.chunkCount,
    filename: chunk.filename,
    content_type: chunk.contentType,
    content_base64: chunk.content,
    created_at: chunk.createdAt,
  };
}

export async function countStoredFiles(): Promise<number> {
  if (!sheetsConfigured()) {
    return memoryChunks.size;
  }
  const rows = await sheets.getRows(TAB);
  return new Set(rows.map((r) => String(r.attachment_id))).size;
}

export async function saveScheduledAttachmentChunk(
  chunk: StoredAttachmentChunk,
): Promise<void> {
  return saveScheduledAttachmentChunks([chunk]);
}

/**
 * Save many chunks (e.g. everything in one upload request) with at most one
 * Sheets read + one append + one batch-update, instead of a read+write pair
 * per chunk. Sheets' write quota is ~60 requests/min per service account, and
 * uploads fire several chunk-batches concurrently — a per-chunk round trip
 * exhausts that in seconds on anything but a tiny file.
 */
export async function saveScheduledAttachmentChunks(
  chunks: StoredAttachmentChunk[],
): Promise<void> {
  if (chunks.length === 0) return;

  if (!sheetsConfigured()) {
    for (const chunk of chunks) {
      const existing = memoryChunks.get(chunk.attachmentId) ?? new Map<number, StoredAttachmentChunk>();
      existing.set(chunk.chunkIndex, chunk);
      memoryChunks.set(chunk.attachmentId, existing);
    }
    return;
  }

  const rows = await sheets.getRows(TAB);
  const existingIds = new Set(rows.map((r) => String(r.attachment_id)));
  const newFileIds = new Set(chunks.map((c) => c.attachmentId).filter((id) => !existingIds.has(id)));
  if (newFileIds.size > 0) {
    assertFileLimit(existingIds.size + newFileIds.size);
  }

  const byKey = new Map(
    rows.map((r) => [`${r.attachment_id}:${r.chunk_index}`, r] as const),
  );

  const updates: sheets.RowUpdate[] = [];
  const appends: Record<string, unknown>[] = [];
  let nextIdCounter = await sheets.nextId(TAB);

  for (const chunk of chunks) {
    const existing = byKey.get(`${chunk.attachmentId}:${chunk.chunkIndex}`);
    if (existing) {
      const merged: StoredAttachmentChunk = {
        ...chunk,
        sessionId: chunk.sessionId || (existing.session_id ? String(existing.session_id) : undefined),
        jobId: chunk.jobId || (existing.job_id ? String(existing.job_id) : undefined),
      };
      updates.push({ row: existing._row, obj: chunkToRow(merged, existing.id || existing._row) });
    } else {
      appends.push(chunkToRow(chunk, nextIdCounter++));
    }
  }

  if (appends.length) await sheets.appendRows(TAB, appends);
  if (updates.length) await sheets.batchUpdateRows(TAB, updates);
}

export async function loadScheduledAttachment(attachmentId: string): Promise<EmailAttachment> {
  let chunks: StoredAttachmentChunk[];

  if (!sheetsConfigured()) {
    chunks = Array.from(memoryChunks.get(attachmentId)?.values() ?? []);
  } else {
    const rows = await sheets.getRows(TAB);
    chunks = rows
      .filter((r) => String(r.attachment_id) === attachmentId)
      .map(rowToChunk)
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
    // Deduplicate in case parallel uploads raced past the upsert check.
    const byIndex = new Map<number, StoredAttachmentChunk>();
    for (const c of chunks) byIndex.set(c.chunkIndex, c);
    chunks = [...byIndex.values()].sort((a, b) => a.chunkIndex - b.chunkIndex);
    console.log(`[loadScheduledAttachment] id=${attachmentId} rows=${chunks.length}`);
  }

  if (chunks.length === 0) {
    throw new Error(`Attachment ${attachmentId} was not found`);
  }

  // Accept both dense 0..n-1 indices and expanded legacy indices (gaps between
  // client-chunk groups). Require sorted unique indices with no duplicates.
  const indices = chunks.map((c) => c.chunkIndex);
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] <= indices[i - 1]) {
      throw new Error(`Attachment ${chunks[0].filename} has duplicate or out-of-order chunks`);
    }
  }

  return {
    id: attachmentId,
    filename: chunks[0].filename,
    contentType: chunks[0].contentType,
    content: chunks.map((chunk) => chunk.content).join(''),
  };
}

export async function deleteScheduledAttachments(attachmentIds: string[]): Promise<void> {
  const ids = new Set(attachmentIds.filter(Boolean));
  if (ids.size === 0) return;

  if (!sheetsConfigured()) {
    for (const id of ids) {
      const chunks = memoryChunks.get(id);
      if (chunks) {
        const hasJobId = [...chunks.values()].some((c) => c.jobId);
        if (!hasJobId) memoryChunks.delete(id);
      }
    }
    return;
  }

  const rows = await sheets.getRows(TAB);
  const toDelete = rows
    .filter((r) => ids.has(String(r.attachment_id)) && !r.job_id)
    .map((r) => r._row);
  await sheets.deleteRows(TAB, toDelete);
}

/** Tag selected files with a send job so they survive composer cleanup.
 *  Returns the number of sheet rows claimed. */
export async function claimAttachmentsForJob(
  jobId: string,
  attachmentIds: string[],
): Promise<number> {
  const ids = [...new Set(attachmentIds.filter(Boolean))];
  if (ids.length === 0) return 0;

  if (!sheetsConfigured()) {
    let claimed = 0;
    for (const id of ids) {
      const chunks = memoryChunks.get(id);
      if (!chunks) continue;
      for (const chunk of chunks.values()) chunk.jobId = jobId;
      claimed += chunks.size;
    }
    return claimed;
  }

  const idSet = new Set(ids);
  const rows = await sheets.getRows(TAB);
  const matched = rows.filter((r) => idSet.has(String(r.attachment_id)));
  console.log(`[claimAttachmentsForJob] jobId=${jobId} ids=${ids.join(',')} rows=${matched.length}`);

  // Only patch job_id — never rewrite content_base64 (Sheets can drop/truncate
  // large cells when a full-row update is sent).
  await sheets.batchUpdateColumn(
    TAB,
    'job_id',
    matched.map((r) => ({ row: r._row, value: jobId })),
  );
  return matched.length;
}

/** Delete composer uploads in a session that are not in the keep list. */
export async function deleteUnselectedSessionFiles(
  sessionId: string,
  keepAttachmentIds: string[],
): Promise<number> {
  const keep = new Set(keepAttachmentIds.filter(Boolean));

  if (!sheetsConfigured()) {
    let removed = 0;
    for (const [id, chunks] of memoryChunks) {
      const first = chunks.values().next().value;
      if (first?.sessionId === sessionId && !first?.jobId && !keep.has(id)) {
        memoryChunks.delete(id);
        removed++;
      }
    }
    return removed;
  }

  const rows = await sheets.getRows(TAB);
  const toDelete = rows
    .filter((r) => {
      if (r.job_id) return false;
      if (String(r.session_id) !== sessionId) return false;
      if (keep.size === 0) return true;
      return !keep.has(String(r.attachment_id));
    })
    .map((r) => r._row);
  await sheets.deleteRows(TAB, toDelete);
  return toDelete.length;
}

/** Clear composer uploads for a session (keeps job-linked files). */
export async function resetSessionFileBase(sessionId?: string): Promise<number> {
  if (!sheetsConfigured()) {
    let removed = 0;
    for (const [id, chunks] of memoryChunks) {
      const first = chunks.values().next().value;
      if (!first?.jobId && (!sessionId || first?.sessionId === sessionId)) {
        memoryChunks.delete(id);
        removed++;
      }
    }
    return removed;
  }

  const rows = await sheets.getRows(TAB);
  const toDelete = rows
    .filter((r) => {
      if (r.job_id) return false;
      if (sessionId && String(r.session_id) !== sessionId) return false;
      return true;
    })
    .map((r) => r._row);
  await sheets.deleteRows(TAB, toDelete);
  return toDelete.length;
}

/** Safe delete: only removes composer/unlinked rows. */
export async function emptyFilesHandler(): Promise<number> {
  return emptyComposerFiles();
}

/** Delete composer rows only — keeps files linked to ANY send job. */
export async function emptyComposerFiles(_activeJobIds: string[] = []): Promise<number> {
  if (!sheetsConfigured()) {
    let removed = 0;
    for (const [id, chunks] of memoryChunks) {
      const jobId = chunks.values().next().value?.jobId;
      if (!jobId) {
        memoryChunks.delete(id);
        removed++;
      }
    }
    return removed;
  }

  const rows = await sheets.getRows(TAB);
  const toDelete = rows.filter((r) => !r.job_id).map((r) => r._row);
  await sheets.deleteRows(TAB, toDelete);
  return toDelete.length;
}

/** Delete composer uploads by id, then wipe all unclaimed rows. */
export async function deleteComposerStorage(
  _sessionId: string,
  attachmentIds: string[] = [],
): Promise<void> {
  const ids = [...new Set(attachmentIds.filter(Boolean))];
  if (ids.length > 0) {
    await deleteScheduledAttachments(ids);
  }
  await emptyComposerFiles();
  await purgeLegacySessionFiles();
  await emptyComposerFiles();
}

/** Move selected session files to a job without deleting any files during scheduling. */
export async function transferSessionFilesToJob(
  _sessionId: string,
  jobId: string,
  selectedAttachmentIds: string[],
): Promise<number> {
  const selectedIds = [...new Set(selectedAttachmentIds.filter(Boolean))];
  if (selectedIds.length === 0) return 0;
  return claimAttachmentsForJob(jobId, selectedIds);
}

/** Remove draft uploads with no session tag (older data). */
export async function purgeLegacySessionFiles(): Promise<number> {
  if (!sheetsConfigured()) {
    let removed = 0;
    for (const [id, chunks] of memoryChunks) {
      const first = chunks.values().next().value;
      if (!first?.jobId && !first?.sessionId) {
        memoryChunks.delete(id);
        removed++;
      }
    }
    return removed;
  }

  const rows = await sheets.getRows(TAB);
  const toDelete = rows
    .filter((r) => !r.job_id && (!r.session_id || String(r.session_id) === ''))
    .map((r) => r._row);
  await sheets.deleteRows(TAB, toDelete);
  return toDelete.length;
}

/** Remove files whose job row no longer exists. */
export async function purgeOrphanJobFiles(): Promise<number> {
  if (!sheetsConfigured()) {
    return 0;
  }

  const { listSendJobs } = await import('@/lib/send-job-store');
  const activeJobIds = new Set((await listSendJobs()).map((j) => j.id));

  const rows = await sheets.getRows(TAB);
  const toDelete = rows
    .filter((r) => r.job_id && !activeJobIds.has(String(r.job_id)))
    .map((r) => r._row);
  await sheets.deleteRows(TAB, toDelete);
  return toDelete.length;
}

/** Remove all draft/session uploads not linked to a send job. */
export async function purgeSessionFiles(): Promise<number> {
  return emptyComposerFiles();
}

/** Remove all files owned by a completed/cancelled job. */
export async function deleteJobFiles(jobId: string): Promise<void> {
  if (!sheetsConfigured()) {
    for (const [id, chunks] of memoryChunks) {
      if (chunks.values().next().value?.jobId === jobId) memoryChunks.delete(id);
    }
    return;
  }

  const rows = await sheets.getRows(TAB);
  const toDelete = rows.filter((r) => String(r.job_id) === jobId).map((r) => r._row);
  await sheets.deleteRows(TAB, toDelete);
}

export function getAttachmentIdsFromMap(
  attachmentMap: Record<string, EmailAttachment[]> | undefined,
): string[] {
  if (!attachmentMap) return [];
  return [
    ...new Set(
      Object.values(attachmentMap)
        .flat()
        .map((attachment) => attachment.id)
        .filter(Boolean),
    ),
  ];
}

export function getAttachmentIdsFromFileList(
  files: Array<{ id: string }> | undefined,
): string[] {
  if (!files?.length) return [];
  return [...new Set(files.map((file) => file.id).filter(Boolean))];
}

export function stripAttachmentContent(
  attachment: EmailAttachment,
): EmailAttachment {
  if (!attachment.content) return attachment;
  return {
    id: attachment.id,
    filename: attachment.filename,
    contentType: attachment.contentType,
    content: '',
  };
}

export function stripAttachmentMapForStorage(
  attachmentMap: Record<string, EmailAttachment[]> | undefined,
): Record<string, EmailAttachment[]> {
  if (!attachmentMap) return {};
  return Object.fromEntries(
    Object.entries(attachmentMap).map(([email, attachments]) => [
      email,
      attachments.map(stripAttachmentContent),
    ]),
  );
}

export async function hydrateScheduledAttachmentMap(
  attachmentMap: Record<string, EmailAttachment[]> | undefined,
): Promise<Record<string, EmailAttachment[]>> {
  if (!attachmentMap) return {};

  const cache = new Map<string, EmailAttachment>();
  const entries = await Promise.all(
    Object.entries(attachmentMap).map(async ([email, attachments]) => {
      const hydrated = await Promise.all(
        attachments.map(async (attachment) => {
          const ensure = (att: EmailAttachment) => {
            if (!att.content?.trim()) {
              throw new Error(
                `Attachment "${att.filename || att.id}" has no stored content. Re-upload the file and schedule again.`,
              );
            }
            return att;
          };
          if (attachment.content) return ensure(attachment);
          const cached = cache.get(attachment.id);
          if (cached) return cached;
          const loaded = ensure(await loadScheduledAttachment(attachment.id));
          cache.set(attachment.id, loaded);
          return loaded;
        }),
      );
      return [email, hydrated] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function cleanupJobAttachments(
  attachmentMap: Record<string, EmailAttachment[]> | undefined,
  jobId?: string,
): Promise<void> {
  if (jobId) {
    await deleteJobFiles(jobId);
  } else {
    await deleteScheduledAttachments(getAttachmentIdsFromMap(attachmentMap));
  }
  await emptyComposerFiles();
}
