import { NextRequest, NextResponse } from 'next/server';
import {
  ATTACHMENT_CHUNK_CHARACTERS,
  getSafeAttachmentContentType,
  getSafeAttachmentFilename,
  splitAttachmentContent,
} from '@/lib/attachments';
import {
  deleteScheduledAttachments,
  emptyComposerFiles,
  saveScheduledAttachmentChunks,
  type StoredAttachmentChunk,
} from '@/lib/scheduled-attachments';

export const maxDuration = 60;

/** Accept legacy clients that still send ~950k Turso-sized chunks; re-split before Sheets write. */
const MAX_CHUNK_CHARACTERS = 950_000;
const MAX_CHUNKS_PER_REQUEST = 4;
/** Max sheet pieces one oversized client chunk can expand into. */
const MAX_SHEET_PIECES_PER_CLIENT_CHUNK = Math.ceil(MAX_CHUNK_CHARACTERS / ATTACHMENT_CHUNK_CHARACTERS);

interface ChunkPayload {
  attachmentId: string;
  sessionId?: string;
  chunkIndex: number;
  chunkCount: number;
  content: string;
  contentType: string;
  filename: string;
  createdAt: string;
}

function parseChunk(raw: unknown): { chunk: ChunkPayload | null; reason?: string } {
  if (!raw || typeof raw !== 'object') return { chunk: null, reason: 'not an object' };
  const body = raw as Record<string, unknown>;
  const attachmentId = typeof body.attachmentId === 'string' ? body.attachmentId : '';
  const chunkIndex = Number(body.chunkIndex);
  const chunkCount = Number(body.chunkCount);
  // Strip whitespace/newlines some encoders insert into base64.
  const content = typeof body.content === 'string' ? body.content.replace(/\s+/g, '') : '';
  const contentType = getSafeAttachmentContentType(body.contentType);
  const filename = getSafeAttachmentFilename(body.filename, contentType);

  if (!attachmentId) return { chunk: null, reason: 'missing attachmentId' };
  if (!Number.isInteger(chunkIndex) || !Number.isInteger(chunkCount)) {
    return { chunk: null, reason: 'chunkIndex/chunkCount must be integers' };
  }
  if (chunkIndex < 0 || chunkCount < 1 || chunkIndex >= chunkCount) {
    return { chunk: null, reason: `bad chunk range ${chunkIndex}/${chunkCount}` };
  }
  if (content.length > MAX_CHUNK_CHARACTERS) {
    return { chunk: null, reason: `chunk too large (${content.length} > ${MAX_CHUNK_CHARACTERS})` };
  }
  if (content && !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) {
    return { chunk: null, reason: 'content is not valid base64' };
  }

  return {
    chunk: {
      attachmentId,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId : undefined,
      chunkIndex,
      chunkCount,
      content,
      contentType,
      filename,
      createdAt: typeof body.createdAt === 'string' ? body.createdAt : new Date().toISOString(),
    },
  };
}

/** Expand one incoming chunk into the Sheets-row pieces it needs to become — no I/O. */
function chunkToPieces(chunk: ChunkPayload): StoredAttachmentChunk[] {
  const pieces = splitAttachmentContent(chunk.content);

  // Normal path: already Sheets-sized (or empty).
  if (pieces.length <= 1) {
    return [{
      attachmentId: chunk.attachmentId,
      sessionId: chunk.sessionId,
      chunkIndex: chunk.chunkIndex,
      chunkCount: chunk.chunkCount,
      filename: chunk.filename,
      contentType: chunk.contentType,
      content: pieces[0] ?? '',
      createdAt: chunk.createdAt,
    }];
  }

  // Legacy oversized client chunk → expand into Sheets-safe indices.
  // sheetIndex = clientChunkIndex * MAX_SHEET_PIECES + pieceIndex
  if (pieces.length > MAX_SHEET_PIECES_PER_CLIENT_CHUNK) {
    throw new Error(`Attachment chunk expands to too many Sheets cells (${pieces.length})`);
  }

  const sheetChunkCount = chunk.chunkCount * MAX_SHEET_PIECES_PER_CLIENT_CHUNK;
  return pieces.map((content, i) => ({
    attachmentId: chunk.attachmentId,
    sessionId: chunk.sessionId,
    chunkIndex: chunk.chunkIndex * MAX_SHEET_PIECES_PER_CLIENT_CHUNK + i,
    chunkCount: sheetChunkCount,
    filename: chunk.filename,
    contentType: chunk.contentType,
    content,
    createdAt: chunk.createdAt,
  }));
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (Array.isArray(body.chunks)) {
    if (body.chunks.length === 0 || body.chunks.length > MAX_CHUNKS_PER_REQUEST) {
      return NextResponse.json({ error: 'Invalid batch size' }, { status: 400 });
    }

    const parsed = body.chunks.map(parseChunk);
    const failed = parsed.find((p: { chunk: ChunkPayload | null; reason?: string }) => !p.chunk);
    if (failed) {
      return NextResponse.json(
        { error: 'Invalid attachment chunk batch', reason: failed.reason },
        { status: 400 },
      );
    }

    try {
      const pieces = (parsed as { chunk: ChunkPayload }[]).flatMap(({ chunk }) => chunkToPieces(chunk));
      await saveScheduledAttachmentChunks(pieces);
      return NextResponse.json({ ok: true, saved: parsed.length });
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 400 });
    }
  }

  const { chunk, reason } = parseChunk(body);
  if (!chunk) {
    return NextResponse.json({ error: 'Invalid attachment chunk', reason }, { status: 400 });
  }

  try {
    await saveScheduledAttachmentChunks(chunkToPieces(chunk));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const purgeAll = body.purgeAll === true || body.all === true;
  const attachmentIds = Array.isArray(body.attachmentIds)
    ? body.attachmentIds.filter((id: unknown): id is string => typeof id === 'string')
    : [];

  if (purgeAll) {
    // Use emptyComposerFiles so we never wipe attachment rows belonging to
    // a pending scheduled send job.
    const removed = await emptyComposerFiles();
    return NextResponse.json({ ok: true, removed });
  }

  if (attachmentIds.length === 0) {
    return NextResponse.json({ error: 'attachmentIds or purgeAll required' }, { status: 400 });
  }

  await deleteScheduledAttachments(attachmentIds);
  return NextResponse.json({ ok: true });
}
