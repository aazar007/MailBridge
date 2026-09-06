'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EmailAttachment } from '@/lib/send-types';
import {
  autoMatchFile,
  collectLetters,
  formatFileSize,
  letterMatchesFilter,
  readFileAsAttachment,
} from '@/lib/attachments';
import { getRecipientName } from '@/lib/template';
import {
  attachmentMetadataOnly,
  deleteAttachmentsFromTurso,
  estimateUploadBatches,
  uploadAttachmentsParallel,
} from '@/lib/session-files-client';
import { cacheAttachment, removeCachedAttachment } from '@/lib/attachment-cache';
import { MAX_TEMP_FILES } from '@/lib/temp-limits';

interface Recipient {
  email: string;
  [key: string]: string;
}

function recipientLabel(r: Recipient): string {
  return getRecipientName(r) || r.email;
}

function LetterFilter({
  letters,
  value,
  onChange,
}: {
  letters: string[];
  value: string;
  onChange: (letter: string) => void;
}) {
  if (letters.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        onClick={() => onChange('all')}
        className={`min-w-8 px-2 py-1 text-xs font-medium rounded-md border transition-colors
          ${value === 'all' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
      >
        All
      </button>
      {letters.map((letter) => (
        <button
          key={letter}
          type="button"
          onClick={() => onChange(letter)}
          dir="auto"
          className={`min-w-8 px-2 py-1 text-xs font-medium rounded-md border transition-colors
            ${value === letter ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'}`}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

function RecipientFileBox({
  recipient,
  files,
  assignedIds,
  onChange,
}: {
  recipient: Recipient;
  files: EmailAttachment[];
  assignedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const name = getRecipientName(recipient);
  const [slots, setSlots] = useState<string[]>(() => (assignedIds.length > 0 ? assignedIds : ['']));

  useEffect(() => {
    setSlots(assignedIds.length > 0 ? assignedIds : ['']);
  }, [assignedIds]);

  function commit(nextSlots: string[]) {
    setSlots(nextSlots);
    onChange(nextSlots.filter(Boolean));
  }

  function setSlot(index: number, fileId: string) {
    const next = [...slots];
    next[index] = fileId;
    commit(next);
  }

  function removeSlot(index: number) {
    const next = slots.filter((_, i) => i !== index);
    commit(next.length > 0 ? next : ['']);
  }

  function addSlot() {
    setSlots([...slots, '']);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="min-w-0">
        <p dir="auto" className="text-sm font-semibold text-gray-900 truncate">{recipient.email}</p>
        {name ? (
          <p dir="auto" className="text-xs text-gray-500 mt-0.5">{name}</p>
        ) : (
          <p className="text-xs text-gray-400 mt-0.5">No name</p>
        )}
      </div>

      {files.length === 0 ? (
        <p className="text-xs text-gray-400">Upload files above to assign them here.</p>
      ) : (
        <div className="space-y-2">
          {slots.map((fileId, index) => (
            <div key={`${recipient.email}-slot-${index}`} className="flex items-center gap-2">
              <select
                value={fileId}
                onChange={(e) => setSlot(index, e.target.value)}
                dir="auto"
                className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Choose a file…</option>
                {files.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.filename}
                  </option>
                ))}
              </select>
              {slots.length > 1 || fileId ? (
                <button
                  type="button"
                  onClick={() => removeSlot(index)}
                  className="shrink-0 rounded-lg border border-gray-200 px-2.5 py-2 text-xs text-gray-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  title="Remove"
                  aria-label="Remove file"
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}

          <button
            type="button"
            onClick={addSlot}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"
          >
            <span className="text-base leading-none">+</span>
            Add file
          </button>
        </div>
      )}
    </div>
  );
}

export function RecipientAttachments({
  recipients,
  files,
  assignments,
  sessionId,
  onFilesChange,
  onAssignmentsChange,
  onUploadingChange,
}: {
  recipients: Recipient[];
  files: EmailAttachment[];
  assignments: Record<string, string[]>;
  onUploadingChange?: (uploading: boolean) => void;
  sessionId: string;
  onFilesChange: (files: EmailAttachment[]) => void;
  onAssignmentsChange: (assignments: Record<string, string[]>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [recipientLetter, setRecipientLetter] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  const recipientLetters = useMemo(
    () => collectLetters(recipients.map(recipientLabel)),
    [recipients],
  );

  const filteredRecipients = useMemo(
    () => recipients.filter((r) => letterMatchesFilter(recipientLabel(r), recipientLetter)),
    [recipients, recipientLetter],
  );

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    if (!sessionId) {
      alert('Session is still starting. Wait a moment and try again.');
      e.target.value = '';
      return;
    }
    if (files.length + list.length > MAX_TEMP_FILES) {
      alert(`Maximum ${MAX_TEMP_FILES} files allowed.`);
      e.target.value = '';
      return;
    }
    setUploading(true);
    setUploadProgress(null);
    onUploadingChange?.(true);
    try {
      const parsed = await Promise.all(Array.from(list).map(readFileAsAttachment));
      await Promise.all(parsed.map((file) => cacheAttachment(file)));
      onFilesChange([...files, ...parsed.map(attachmentMetadataOnly)]);

      const batchCount = parsed.reduce((sum, file) => sum + estimateUploadBatches(file), 0);
      setUploadProgress({ done: 0, total: batchCount });

      await uploadAttachmentsParallel(parsed, (done, total) => {
        setUploadProgress({ done, total });
      }, sessionId);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      setUploadProgress(null);
      onUploadingChange?.(false);
      e.target.value = '';
    }
  }

  function autoAssign() {
    const next: Record<string, string[]> = { ...assignments };
    for (const recipient of recipients) {
      const email = recipient.email;
      if (!email) continue;
      const matched = files
        .filter((f) => autoMatchFile(f.filename, recipient))
        .map((f) => f.id);
      if (matched.length) next[email] = matched;
    }
    onAssignmentsChange(next);
  }

  function setAssignment(email: string, ids: string[]) {
    const cleaned = ids.filter(Boolean);
    if (cleaned.length === 0) {
      const next = { ...assignments };
      delete next[email];
      onAssignmentsChange(next);
      return;
    }
    onAssignmentsChange({ ...assignments, [email]: cleaned });
  }

  function toggleInline(fileId: string) {
    onFilesChange(files.map((f) => (f.id === fileId ? { ...f, inline: !f.inline } : f)));
  }

  function removeFile(fileId: string) {
    void deleteAttachmentsFromTurso([fileId]);
    void removeCachedAttachment(fileId);
    onFilesChange(files.filter((f) => f.id !== fileId));
    const next: Record<string, string[]> = {};
    for (const [email, ids] of Object.entries(assignments)) {
      const filtered = ids.filter((id) => id !== fileId);
      if (filtered.length) next[email] = filtered;
    }
    onAssignmentsChange(next);
  }

  function removeAllFiles() {
    const ids = files.map((f) => f.id);
    void deleteAttachmentsFromTurso(ids);
    void Promise.all(ids.map((id) => removeCachedAttachment(id)));
    onFilesChange([]);
    onAssignmentsChange({});
  }

  if (recipients.length === 0) return null;

  return (
    <div className="space-y-3">
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors bg-card
          ${uploading ? 'border-foreground/30 cursor-wait' : 'border-border hover:border-foreground/30 cursor-pointer'}`}
        onClick={() => { if (!uploading) inputRef.current?.click(); }}
      >
        <input ref={inputRef} type="file" multiple className="hidden" onChange={handleUpload} />
        {uploading && uploadProgress ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              Syncing to storage… {uploadProgress.done}/{uploadProgress.total} batches
            </p>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-foreground transition-all duration-300"
                style={{ width: `${uploadProgress.total ? (uploadProgress.done / uploadProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            {uploading ? 'Reading files…' : `Click to attach files (max ${MAX_TEMP_FILES})`}
          </p>
        )}
      </div>

      {files.length > 0 && (
        <div className="rounded-lg border border-border bg-card px-3 py-2 space-y-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest font-mono">
            Uploaded ({files.length})
          </p>
          <ul className="flex flex-wrap gap-2">
            {files.map((f) => {
              const isImage = f.contentType.startsWith('image/');
              return (
                <li
                  key={f.id}
                  dir="auto"
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700"
                >
                  <span className="truncate max-w-[12rem]">{f.filename}</span>
                  {isImage && (
                    <button
                      type="button"
                      onClick={() => toggleInline(f.id)}
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors
                        ${f.inline ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}
                      title={f.inline ? 'Shown in email body — click to attach as a file instead' : 'Attached as a file — click to show in email body instead'}
                    >
                      {f.inline ? 'In body' : 'Attached'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(f.id)}
                    className="text-gray-400 hover:text-red-600"
                    title="Delete file"
                    aria-label={`Remove ${f.filename}`}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={autoAssign}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Auto-match files to recipients
            </button>
            <button
              type="button"
              onClick={removeAllFiles}
              className="text-xs text-red-600 hover:text-red-800 font-medium"
            >
              Remove all files
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-gray-700">Assign files per recipient</p>
          {recipientLetters.length > 1 && (
            <LetterFilter letters={recipientLetters} value={recipientLetter} onChange={setRecipientLetter} />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[32rem] overflow-y-auto pr-1">
          {filteredRecipients.map((r) => (
            <RecipientFileBox
              key={r.email}
              recipient={r}
              files={files}
              assignedIds={assignments[r.email] ?? []}
              onChange={(ids) => setAssignment(r.email, ids)}
            />
          ))}
        </div>

        {filteredRecipients.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">No recipients for this letter filter.</p>
        )}
      </div>
    </div>
  );
}
