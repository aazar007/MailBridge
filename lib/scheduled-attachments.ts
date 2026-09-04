/**
 * Attachment chunk storage — Postgres table `files_handler`.
 * Chunks are split client-side (see lib/attachments.ts); this layer just
 * stores/reassembles them. Falls back to in-memory Maps when DATABASE_URL is
 * missing (local/dev).
 */

import { prisma, dbConfigured } from '@/lib/prisma';
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

const memoryChunks = new Map<string, Map<number, StoredAttachmentChunk>>();

export async function countStoredFiles(): Promise<number> {
  if (!dbConfigured()) {
    return memoryChunks.size;
  }
  const rows = await prisma.attachmentChunk.findMany({ select: { attachmentId: true } });
  return new Set(rows.map((r) => r.attachmentId)).size;
}

export async function saveScheduledAttachmentChunk(
  chunk: StoredAttachmentChunk,
): Promise<void> {
  return saveScheduledAttachmentChunks([chunk]);
}

/**
 * Save many chunks (e.g. everything in one upload request) in a single
 * transaction, instead of one round trip per chunk.
 */
export async function saveScheduledAttachmentChunks(
  chunks: StoredAttachmentChunk[],
): Promise<void> {
  if (chunks.length === 0) return;

  if (!dbConfigured()) {
    for (const chunk of chunks) {
      const existing = memoryChunks.get(chunk.attachmentId) ?? new Map<number, StoredAttachmentChunk>();
      existing.set(chunk.chunkIndex, chunk);
      memoryChunks.set(chunk.attachmentId, existing);
    }
    return;
  }

  const existingIds = new Set(
    (await prisma.attachmentChunk.findMany({ select: { attachmentId: true }, distinct: ['attachmentId'] }))
      .map((r) => r.attachmentId),
  );
  const newFileIds = new Set(chunks.map((c) => c.attachmentId).filter((id) => !existingIds.has(id)));
  if (newFileIds.size > 0) {
    assertFileLimit(existingIds.size + newFileIds.size);
  }

  await prisma.$transaction(
    chunks.map((chunk) =>
      prisma.attachmentChunk.upsert({
        where: { attachmentId_chunkIndex: { attachmentId: chunk.attachmentId, chunkIndex: chunk.chunkIndex } },
        create: {
          attachmentId: chunk.attachmentId,
          sessionId: chunk.sessionId,
          jobId: chunk.jobId,
          chunkIndex: chunk.chunkIndex,
          chunkCount: chunk.chunkCount,
          filename: chunk.filename,
          contentType: chunk.contentType,
          contentBase64: chunk.content,
        },
        update: {
          // Never clobber an already-claimed sessionId/jobId with an empty one.
          sessionId: chunk.sessionId,
          jobId: chunk.jobId,
          chunkCount: chunk.chunkCount,
          filename: chunk.filename,
          contentType: chunk.contentType,
          contentBase64: chunk.content,
        },
      }),
    ),
  );
}

export async function loadScheduledAttachment(attachmentId: string): Promise<EmailAttachment> {
  let chunks: StoredAttachmentChunk[];

  if (!dbConfigured()) {
    chunks = Array.from(memoryChunks.get(attachmentId)?.values() ?? []);
  } else {
    const rows = await prisma.attachmentChunk.findMany({
      where: { attachmentId },
      orderBy: { chunkIndex: 'asc' },
    });
    chunks = rows.map((r) => ({
      attachmentId: r.attachmentId,
      sessionId: r.sessionId ?? undefined,
      jobId: r.jobId ?? undefined,
      chunkIndex: r.chunkIndex,
      chunkCount: r.chunkCount,
      filename: r.filename,
      contentType: r.contentType,
      content: r.contentBase64,
      createdAt: r.createdAt.toISOString(),
    }));
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

  if (!dbConfigured()) {
    for (const id of ids) {
      const chunks = memoryChunks.get(id);
      if (chunks) {
        const hasJobId = [...chunks.values()].some((c) => c.jobId);
        if (!hasJobId) memoryChunks.delete(id);
      }
    }
    return;
  }

  await prisma.attachmentChunk.deleteMany({
    where: { attachmentId: { in: [...ids] }, jobId: null },
  });
}

/** Tag selected files with a send job so they survive composer cleanup.
 *  Returns the number of rows claimed. */
export async function claimAttachmentsForJob(
  jobId: string,
  attachmentIds: string[],
): Promise<number> {
  const ids = [...new Set(attachmentIds.filter(Boolean))];
  if (ids.length === 0) return 0;

  if (!dbConfigured()) {
    let claimed = 0;
    for (const id of ids) {
      const chunks = memoryChunks.get(id);
      if (!chunks) continue;
      for (const chunk of chunks.values()) chunk.jobId = jobId;
      claimed += chunks.size;
    }
    return claimed;
  }

  console.log(`[claimAttachmentsForJob] jobId=${jobId} ids=${ids.join(',')}`);
  const result = await prisma.attachmentChunk.updateMany({
    where: { attachmentId: { in: ids } },
    data: { jobId },
  });
  return result.count;
}

/** Delete composer uploads in a session that are not in the keep list. */
export async function deleteUnselectedSessionFiles(
  sessionId: string,
  keepAttachmentIds: string[],
): Promise<number> {
  const keep = new Set(keepAttachmentIds.filter(Boolean));

  if (!dbConfigured()) {
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

  const result = await prisma.attachmentChunk.deleteMany({
    where: {
      jobId: null,
      sessionId,
      ...(keep.size > 0 ? { attachmentId: { notIn: [...keep] } } : {}),
    },
  });
  return result.count;
}

/** Clear composer uploads for a session (keeps job-linked files). */
export async function resetSessionFileBase(sessionId?: string): Promise<number> {
  if (!dbConfigured()) {
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

  const result = await prisma.attachmentChunk.deleteMany({
    where: { jobId: null, ...(sessionId ? { sessionId } : {}) },
  });
  return result.count;
}

/** Safe delete: only removes composer/unlinked rows. */
export async function emptyFilesHandler(): Promise<number> {
  return emptyComposerFiles();
}

/** Delete composer rows only — keeps files linked to ANY send job. */
export async function emptyComposerFiles(_activeJobIds: string[] = []): Promise<number> {
  if (!dbConfigured()) {
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

  const result = await prisma.attachmentChunk.deleteMany({ where: { jobId: null } });
  return result.count;
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
  if (!dbConfigured()) {
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

  const result = await prisma.attachmentChunk.deleteMany({
    where: { jobId: null, sessionId: null },
  });
  return result.count;
}

/** Remove files whose job row no longer exists. */
export async function purgeOrphanJobFiles(): Promise<number> {
  if (!dbConfigured()) {
    return 0;
  }

  const { listSendJobs } = await import('@/lib/send-job-store');
  const activeJobIds = new Set((await listSendJobs()).map((j) => j.id));

  const rows = await prisma.attachmentChunk.findMany({
    where: { jobId: { not: null } },
    select: { id: true, jobId: true },
  });
  const staleRowIds = rows.filter((r) => r.jobId && !activeJobIds.has(r.jobId)).map((r) => r.id);
  if (!staleRowIds.length) return 0;
  await prisma.attachmentChunk.deleteMany({ where: { id: { in: staleRowIds } } });
  return staleRowIds.length;
}

/** Remove all draft/session uploads not linked to a send job. */
export async function purgeSessionFiles(): Promise<number> {
  return emptyComposerFiles();
}

/** Remove all files owned by a completed/cancelled job. */
export async function deleteJobFiles(jobId: string): Promise<void> {
  if (!dbConfigured()) {
    for (const [id, chunks] of memoryChunks) {
      if (chunks.values().next().value?.jobId === jobId) memoryChunks.delete(id);
    }
    return;
  }

  await prisma.attachmentChunk.deleteMany({ where: { jobId } });
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
