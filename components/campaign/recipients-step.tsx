'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, AtSign, Bookmark, FileText, Paperclip, Plus, Trash2, Upload, Users, X } from 'lucide-react';
import Papa from 'papaparse';
import { RecipientAttachments } from '@/components/recipient-attachments';
import { extractPlaceholders, getRecipientName, placeholderNeedsColumn } from '@/lib/template';
import { MAX_TEMP_RECIPIENTS } from '@/lib/temp-limits';
import type { EmailAttachment } from '@/lib/send-types';
import { Btn, Card, ErrorMsg, SectionLabel, TextInput } from '@/components/mail-ui';

interface Template {
  subject: string;
  body: string;
  signature?: string;
}

interface Recipient {
  email: string;
  [key: string]: string;
}

interface Preview {
  to: string;
  toName: string;
  subject: string;
  body: string;
}

interface SavedList {
  name: string;
  recipients: Recipient[];
  columns: string[];
  savedAt: string;
}

const SAVED_LISTS_KEY = 'savedRecipientLists';
const EMAIL_RE = /(?<![{@])\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;

function ManualEntry({
  columns,
  recipients,
  onChange,
}: {
  columns: string[];
  recipients: Recipient[];
  onChange: (r: Recipient[], cols: string[]) => void;
}) {
  function updateRow(idx: number, col: string, val: string) {
    onChange(
      recipients.map((r, i) => (i === idx ? { ...r, [col]: val } : r)),
      columns,
    );
  }

  function addRow() {
    const row: Recipient = { email: '' };
    columns.forEach((c) => { if (!(c in row)) row[c] = ''; });
    onChange([...recipients, row], columns);
  }

  function removeRow(idx: number) {
    onChange(recipients.filter((_, i) => i !== idx), columns);
  }

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {columns.map((c) => (
                <th key={c} className="text-left px-3 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider font-mono">
                  {c}
                </th>
              ))}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recipients.map((row, idx) => (
              <tr key={idx}>
                {columns.map((c) => (
                  <td key={c} className="px-2 py-1.5">
                    <input
                      dir="auto"
                      value={row[c] ?? ''}
                      onChange={(e) => updateRow(idx, c, e.target.value)}
                      placeholder={c === 'email' ? 'email@example.com' : c}
                      className="w-full px-2 py-1.5 bg-input-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20"
                    />
                  </td>
                ))}
                <td className="px-2">
                  <button type="button" onClick={() => removeRow(idx)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Btn variant="secondary" size="sm" onClick={addRow}>
        <Plus className="size-3.5" />
        Add row
      </Btn>
    </div>
  );
}

export function FigmaRecipientsStep({
  template,
  recipients,
  columns,
  attachmentFiles,
  attachmentAssignments,
  sessionId,
  onAttachmentFilesChange,
  onAttachmentAssignmentsChange,
  onAttachmentsUploadingChange,
  onRecipientsChange,
  error,
}: {
  template: Template;
  recipients: Recipient[];
  columns: string[];
  attachmentFiles: EmailAttachment[];
  attachmentAssignments: Record<string, string[]>;
  sessionId: string;
  onAttachmentFilesChange: (files: EmailAttachment[]) => void;
  onAttachmentAssignmentsChange: (assignments: Record<string, string[]>) => void;
  onAttachmentsUploadingChange?: (uploading: boolean) => void;
  onRecipientsChange: (r: Recipient[], cols: string[]) => void;
  error: string;
}) {
  const [tab, setTab] = useState<'csv' | 'manual'>('csv');
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');
  const [csvError, setCsvError] = useState('');
  const [savedLists, setSavedLists] = useState<SavedList[]>([]);
  const [saveListName, setSaveListName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const placeholders = extractPlaceholders(`${template.subject} ${template.body}`);
  const manualCols = ['email', ...placeholders.filter((p) => p !== 'email')];
  const activeCols = columns.length > 0 ? columns : manualCols;
  const missing = placeholders.filter(
    (p) => placeholderNeedsColumn(p) && activeCols.length > 0 && !activeCols.includes(p),
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_LISTS_KEY);
      if (raw) setSavedLists(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const detectedEmails = useCallback(() => {
    const matches = template.body.match(EMAIL_RE) || [];
    const existing = new Set(recipients.map((r) => r.email.toLowerCase()));
    return [...new Set(matches)].filter((e) => !existing.has(e.toLowerCase()) && !e.includes('{{'));
  }, [template.body, recipients]);

  const autoDetected = detectedEmails();

  function addManual() {
    if (!manualEmail.trim()) return;
    const row: Recipient = { email: manualEmail.trim() };
    if (manualName.trim()) row[manualCols.find((c) => c !== 'email') ?? 'name'] = manualName.trim();
    manualCols.forEach((c) => { if (!(c in row)) row[c] = ''; });
    onRecipientsChange([...recipients, row], manualCols);
    setManualName('');
    setManualEmail('');
  }

  function removeRecip(email: string) {
    onRecipientsChange(recipients.filter((r) => r.email !== email), activeCols);
  }

  function addDetected(email: string) {
    const row: Recipient = { email };
    manualCols.forEach((c) => { if (c !== 'email') row[c] = ''; });
    onRecipientsChange([...recipients, row], manualCols);
  }

  function addAllDetected() {
    const rows = autoDetected.map((email) => {
      const row: Recipient = { email };
      manualCols.forEach((c) => { if (c !== 'email') row[c] = ''; });
      return row;
    });
    onRecipientsChange([...recipients, ...rows], manualCols);
  }

  function handleCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError('');
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      complete(results) {
        const normalized = results.data.map((row) => {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(row)) {
            out[k.trim().replace(/\s+/g, '_')] = (v ?? '').trim();
          }
          return out as Recipient;
        });
        if (normalized.length === 0) {
          setCsvError('CSV file is empty or has no valid rows.');
          return;
        }
        if (normalized.length > MAX_TEMP_RECIPIENTS) {
          setCsvError(`Maximum ${MAX_TEMP_RECIPIENTS} recipients per session. Your file has ${normalized.length}.`);
          return;
        }
        onRecipientsChange(normalized, Object.keys(normalized[0] || {}));
        setTab('csv');
      },
      error(err) {
        setCsvError(err.message || 'Could not parse CSV file.');
      },
    });
    e.target.value = '';
  }

  function saveCurrentList() {
    if (!saveListName.trim() || recipients.length === 0) return;
    const entry: SavedList = {
      name: saveListName.trim(),
      recipients,
      columns: activeCols,
      savedAt: new Date().toISOString(),
    };
    const updated = [...savedLists.filter((l) => l.name !== entry.name), entry];
    setSavedLists(updated);
    localStorage.setItem(SAVED_LISTS_KEY, JSON.stringify(updated));
    setSaveListName('');
    setShowSaveInput(false);
  }

  function loadSavedList(list: SavedList) {
    onRecipientsChange(list.recipients, list.columns);
  }

  function deleteSavedList(name: string) {
    const updated = savedLists.filter((l) => l.name !== name);
    setSavedLists(updated);
    localStorage.setItem(SAVED_LISTS_KEY, JSON.stringify(updated));
  }

  const assignedCount = Object.values(attachmentAssignments).filter((ids) => ids.length > 0).length;

  return (
    <Card title="Recipients & files" subtitle="Add recipients, import a CSV, and distribute attachments per person">
      <AnimatePresence>
        {autoDetected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-start gap-3 p-4 border border-foreground/20 rounded-lg bg-foreground/[0.03]"
          >
            <AlertCircle className="size-4 text-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {autoDetected.length} email address{autoDetected.length > 1 ? 'es' : ''} detected in your draft
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {autoDetected.map((e) => (
                  <button key={e} type="button" onClick={() => addDetected(e)} className="flex items-center gap-1.5 px-2 py-1 bg-background border border-border rounded text-xs font-mono text-foreground hover:border-foreground/40 hover:bg-muted transition-colors">
                    <Plus className="size-3" />
                    {e}
                  </button>
                ))}
              </div>
            </div>
            {autoDetected.length > 1 && (
              <button type="button" onClick={addAllDetected} className="text-xs font-semibold text-foreground hover:underline shrink-0">
                Add all
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {savedLists.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>Saved lists</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {savedLists.map((list) => (
              <div key={list.name} className="flex items-center gap-1 border border-border rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => loadSavedList(list)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <Bookmark className="size-3 text-muted-foreground" />
                  {list.name}
                  <span className="text-muted-foreground font-normal">({list.recipients.length})</span>
                </button>
                <button type="button" onClick={() => deleteSavedList(list.name)} className="px-2 py-1.5 text-muted-foreground hover:text-destructive border-l border-border">
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {(['csv', 'manual'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t === 'csv' ? 'Import CSV' : 'Manual entry'}
          </button>
        ))}
      </div>

      {tab === 'csv' ? (
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border border-dashed border-border rounded-lg bg-card flex flex-col items-center justify-center gap-3 p-8 hover:border-foreground/30 hover:bg-muted/40 transition-colors cursor-pointer"
          >
            <div className="size-10 rounded-lg bg-muted flex items-center justify-center">
              <Upload className="size-5 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Import CSV</p>
              <p className="text-xs text-muted-foreground mt-0.5">First row = column headers · include an <code className="font-mono">email</code> column</p>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleCSV} />
          </button>
          {csvError && (
            <p className="text-sm text-destructive font-medium">{csvError}</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="border border-border rounded-lg bg-card p-4 space-y-3">
            <p className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              Quick add
            </p>
            <TextInput value={manualName} onChange={setManualName} placeholder="Full name (optional)" />
            <TextInput value={manualEmail} onChange={setManualEmail} placeholder="email@example.com" icon={AtSign} />
            <Btn onClick={addManual} disabled={!manualEmail.trim()} className="w-full">
              <Plus className="size-4" />
              Add Recipient
            </Btn>
          </div>
          <div className="space-y-2">
            <SectionLabel>Recipient table</SectionLabel>
            <ManualEntry
              columns={manualCols}
              recipients={recipients}
              onChange={onRecipientsChange}
            />
          </div>
        </div>
      )}

      {recipients.length > 0 && tab === 'csv' && columns.length > 0 && (
        <div className="space-y-2">
          <SectionLabel>CSV preview</SectionLabel>
          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-xs min-w-[400px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {columns.slice(0, 6).map((c) => (
                    <th key={c} className="text-left px-3 py-2 font-semibold text-muted-foreground uppercase tracking-wider font-mono">{c}</th>
                  ))}
                  {columns.length > 6 && <th className="px-3 py-2 text-muted-foreground">…</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recipients.slice(0, 5).map((row, idx) => (
                  <tr key={idx}>
                    {columns.slice(0, 6).map((c) => (
                      <td key={c} dir="auto" className="px-3 py-2 text-foreground truncate max-w-[140px]">{row[c] ?? '—'}</td>
                    ))}
                    {columns.length > 6 && <td className="px-3 py-2 text-muted-foreground">…</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {recipients.length > 5 && (
              <p className="text-xs text-muted-foreground px-3 py-2 border-t border-border">+{recipients.length - 5} more rows</p>
            )}
          </div>
        </div>
      )}

      {recipients.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SectionLabel>
              Recipients <span className="text-foreground">{recipients.length}</span>
            </SectionLabel>
            <div className="flex items-center gap-2">
              {!showSaveInput ? (
                <button type="button" onClick={() => setShowSaveInput(true)} className="text-xs font-semibold text-muted-foreground hover:text-foreground">
                  Save list
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    value={saveListName}
                    onChange={(e) => setSaveListName(e.target.value)}
                    placeholder="List name"
                    className="px-2 py-1 text-xs border border-border rounded-md bg-input-background"
                  />
                  <button type="button" onClick={saveCurrentList} disabled={!saveListName.trim()} className="text-xs font-semibold text-foreground">Save</button>
                  <button type="button" onClick={() => { setShowSaveInput(false); setSaveListName(''); }} className="text-xs text-muted-foreground">Cancel</button>
                </div>
              )}
              <button type="button" onClick={() => onRecipientsChange([], activeCols)} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                Clear all
              </button>
            </div>
          </div>
          {tab === 'csv' && (
            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
              {recipients.map((r) => (
                <div key={r.email} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="size-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-foreground font-mono">
                      {(getRecipientName(r) || r.email)[0]?.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    {getRecipientName(r) && <p dir="auto" className="text-sm font-semibold text-foreground truncate">{getRecipientName(r)}</p>}
                    <p dir="auto" className="text-xs text-muted-foreground font-mono truncate">{r.email}</p>
                  </div>
                  <button type="button" onClick={() => removeRecip(r.email)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {missing.length > 0 && (
        <div className="p-3 bg-destructive/5 rounded-lg border border-destructive/20 text-sm text-destructive">
          Missing columns for placeholders: {missing.map((p) => `{{${p}}}`).join(', ')}
        </div>
      )}

      <div className="space-y-3">
        <SectionLabel>
          Attachments{' '}
          <span className="text-foreground">{attachmentFiles.length}</span>
        </SectionLabel>
        {recipients.length === 0 ? (
          <div className="flex items-center gap-3 p-4 border border-dashed border-border rounded-lg text-muted-foreground">
            <Paperclip className="size-4 shrink-0" />
            <span className="text-sm">Add recipients first, then attach files per person</span>
          </div>
        ) : (
          <RecipientAttachments
            recipients={recipients}
            files={attachmentFiles}
            assignments={attachmentAssignments}
            sessionId={sessionId}
            onFilesChange={onAttachmentFilesChange}
            onAssignmentsChange={onAttachmentAssignmentsChange}
            onUploadingChange={onAttachmentsUploadingChange}
          />
        )}
        {attachmentFiles.length > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <FileText className="size-3.5 shrink-0" />
            {attachmentFiles.length} file{attachmentFiles.length !== 1 ? 's' : ''} uploaded
            {assignedCount > 0 && ` · assigned to ${assignedCount} recipient${assignedCount !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      <ErrorMsg msg={error} />
    </Card>
  );
}

export function validateRecipientsStep(recipients: Recipient[]): string | null {
  if (recipients.length === 0) return 'Add at least one recipient.';
  if (!recipients.some((r) => r.email?.includes('@'))) return 'Must have valid email addresses.';
  if (recipients.length > MAX_TEMP_RECIPIENTS) return `Maximum ${MAX_TEMP_RECIPIENTS} recipients allowed per session.`;
  return null;
}

export async function fetchPreviews(template: Template, recipients: Recipient[]): Promise<Preview[]> {
  const res = await fetch('/api/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template, recipients }),
  });
  const data = await res.json();
  return data.previews ?? [];
}
