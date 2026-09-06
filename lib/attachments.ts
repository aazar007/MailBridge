import type { EmailAttachment } from '@/lib/send-types';
import { createId } from '@/lib/id';

const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function readFileAsAttachment(file: File): Promise<EmailAttachment> {
  if (file.size > MAX_FILE_BYTES) {
    return Promise.reject(new Error(`${file.name} is too large (max ${formatFileSize(MAX_FILE_BYTES)})`));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = reader.result;
        if (typeof dataUrl !== 'string') {
          reject(new Error(`Failed to read ${file.name}`));
          return;
        }
        const comma = dataUrl.indexOf(',');
        const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : '';
        if (!base64) {
          reject(new Error(`Failed to read ${file.name}`));
          return;
        }
        resolve({
          id: createId('att_'),
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          content: base64,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(`Failed to read ${file.name}`));
      }
    };
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Strip everything but letters/digits so "John Smith", "John-Smith" and
 * "John_Smith" all reduce to the same token — filenames use any of these
 * separators (or none at all, e.g. "JohnSmith.pdf") interchangeably. */
function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

export function autoMatchFile(filename: string, recipient: Record<string, string>): boolean {
  const lower = filename.toLowerCase();
  const normalizedFilename = normalizeForMatch(filename);
  const email = recipient.email?.toLowerCase() ?? '';
  const local = email.split('@')[0];

  if (local.length > 2 && lower.includes(local)) return true;

  for (const key of ['attachment', 'file', 'filename']) {
    const val = recipient[key]?.trim();
    if (val && lower.includes(val.toLowerCase())) return true;
  }

  for (const [key, val] of Object.entries(recipient)) {
    if (key === 'email' || !val?.trim()) continue;
    const token = normalizeForMatch(val);
    if (token.length > 2 && normalizedFilename.includes(token)) return true;
  }

  return false;
}

export function buildAttachmentMap(
  recipients: Record<string, string>[],
  files: EmailAttachment[],
  assignments: Record<string, string[]>,
): Record<string, EmailAttachment[]> {
  const byId = new Map(files.map((f) => [f.id, f]));
  const map: Record<string, EmailAttachment[]> = {};

  for (const recipient of recipients) {
    const email = recipient.email;
    if (!email) continue;
    const ids = assignments[email] ?? [];
    map[email] = ids.map((id) => byId.get(id)).filter(Boolean) as EmailAttachment[];
  }

  // If files were uploaded but none assigned, attach every file to every recipient.
  // Prevents scheduled/instant sends that silently drop attachments.
  const anyAssigned = Object.values(map).some((list) => list.length > 0);
  if (!anyAssigned && files.length > 0) {
    for (const recipient of recipients) {
      const email = recipient.email;
      if (!email) continue;
      map[email] = [...files];
    }
  }

  return map;
}

export function getAssignedFilenames(
  email: string,
  files: EmailAttachment[],
  assignments: Record<string, string[]>,
): string[] {
  const byId = new Map(files.map((f) => [f.id, f.filename]));
  return (assignments[email] ?? [])
    .map((id) => byId.get(id))
    .filter(Boolean) as string[];
}

/** First letter of a filename (Arabic or Latin) for filtering. */
export function getLeadingLetter(text: string): string {
  const base = text.replace(/\.[^.]+$/, '').trim();
  const match = base.match(/[a-zA-Z\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/);
  if (!match) return '#';
  const ch = match[0];
  if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(ch)) return ch;
  return ch.toUpperCase();
}

export function collectLetters(labels: string[]): string[] {
  const letters = new Set<string>();
  for (const label of labels) {
    letters.add(getLeadingLetter(label));
  }
  return [...letters].sort((a, b) => a.localeCompare(b, ['ar', 'en']));
}

export function letterMatchesFilter(label: string, filter: string): boolean {
  if (filter === 'all') return true;
  return getLeadingLetter(label) === filter;
}

export function getSafeAttachmentFilename(name: unknown, _contentType?: string): string {
  const base = typeof name === 'string'
    ? name.replace(/[/\\<>:"|?*\u0000-\u001f]/g, '_').trim()
    : 'attachment';
  return base.slice(0, 200) || 'attachment';
}

export function getSafeAttachmentContentType(type: unknown): string {
  if (typeof type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(type)) return type;
  return 'application/octet-stream';
}

/**
 * Postgres TEXT columns have no meaningful size limit (this was a Google
 * Sheets cell-size limit, ~50k chars, from before the Prisma migration —
 * left at that value it fragmented an ~8MB attachment into 260+ database
 * rows, which is what made loading attachments at send time slow enough to
 * exhaust the whole send function's time budget). This is now sized to fit
 * comfortably under one HTTP request body (see MAX_CHUNK_CHARACTERS in
 * app/api/session/files/route.ts) — one client chunk becomes one row.
 */
export const ATTACHMENT_CHUNK_CHARACTERS = 900_000;

export function splitAttachmentContent(content: string): string[] {
  if (!content) return [''];
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += ATTACHMENT_CHUNK_CHARACTERS) {
    chunks.push(content.slice(i, i + ATTACHMENT_CHUNK_CHARACTERS));
  }
  return chunks;
}

