'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Eye, EyeOff, Loader2, Mail, PenLine, RefreshCw } from 'lucide-react';
import { TransitionLink } from '@/components/transition-link';
import { GmailLogo, OutlookLogo } from '@/lib/logos';
import { FIGMA_TEMPLATES, type FigmaTemplateId } from '@/lib/figma-templates';
import { extractPlaceholders } from '@/lib/template';
import { Card, ErrorMsg, Field, Notice, SectionLabel, SelectCard, TextInput, textareaCls } from '@/components/mail-ui';

interface Template {
  subject: string;
  body: string;
  signature?: string;
}

interface DraftSummary {
  id: string;
  subject: string;
  date?: string;
}

export function FigmaDraftStep({
  template,
  onChange,
  error,
  isGmail,
  isOutlook,
  gmailConnected,
  outlookConnected,
}: {
  template: Template;
  onChange: (t: Template) => void;
  error: string;
  isGmail: boolean;
  isOutlook: boolean;
  gmailConnected: boolean;
  outlookConnected: boolean;
}) {
  const [templateId, setTemplateId] = useState<FigmaTemplateId | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [useSignature, setUseSignature] = useState(!!template.signature);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  const isOAuth = isGmail || isOutlook;
  const oauthConnected = isGmail ? gmailConnected : outlookConnected;
  const providerName = isGmail ? 'Gmail' : 'Outlook';
  const ProviderLogo = isGmail ? GmailLogo : OutlookLogo;
  const providerColor = isGmail ? '#EA4335' : '#0078D4';
  const placeholders = extractPlaceholders(`${template.subject} ${template.body}`);
  const fullBody = template.body + (useSignature && template.signature ? `\n\n-- \n${template.signature}` : '');

  useEffect(() => {
    if (template.signature?.trim()) setUseSignature(true);
  }, [template.signature]);

  async function loadDrafts() {
    setDraftsLoading(true);
    try {
      const endpoint = isGmail ? '/api/drafts' : '/api/drafts/outlook';
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error('Could not load drafts');
      const data = await res.json();
      setDrafts(Array.isArray(data.drafts) ? data.drafts : []);
      setDraftsLoaded(true);
    } catch {
      setDrafts([]);
      setDraftsLoaded(true);
    } finally {
      setDraftsLoading(false);
    }
  }

  async function pickDraft(id: string) {
    setSelectedDraftId(id);
    setTemplateId(null);
    try {
      const endpoint = isGmail ? `/api/drafts/${id}` : `/api/drafts/outlook/${id}`;
      const res = await fetch(endpoint);
      const data = await res.json();
      onChange({
        subject: data.subject ?? '',
        body: data.body ?? '',
        signature: data.signature ?? template.signature ?? '',
      });
      setPreviewMode(false);
    } catch {
      /* ignore */
    }
  }

  function pickTemplate(id: FigmaTemplateId) {
    const tpl = FIGMA_TEMPLATES.find((t) => t.id === id)!;
    setTemplateId(id);
    setSelectedDraftId(null);
    onChange({ ...template, subject: tpl.subject, body: tpl.body });
    setPreviewMode(false);
  }

  return (
    <Card
      title="Compose your draft"
      subtitle={
        isOAuth && oauthConnected
          ? `Load drafts from your ${providerName} account, or choose a template`
          : 'Choose a template and customize the content'
      }
    >
      {isOAuth && oauthConnected && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center rounded-md shrink-0" style={{ width: 28, height: 28, backgroundColor: providerColor }}>
                <ProviderLogo size={16} />
              </div>
              <SectionLabel>{providerName} Drafts</SectionLabel>
            </div>
            {!draftsLoaded && (
              <button type="button" onClick={loadDrafts} disabled={draftsLoading} className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground border border-border rounded-md px-3 py-1.5 hover:bg-muted disabled:opacity-60">
                {draftsLoading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                {draftsLoading ? 'Loading…' : `Load from ${providerName}`}
              </button>
            )}
            {draftsLoaded && (
              <button type="button" onClick={() => { setDraftsLoaded(false); setDrafts([]); }} className="text-xs text-muted-foreground hover:text-foreground">
                Refresh
              </button>
            )}
          </div>

          {!draftsLoaded && !draftsLoading && (
            <button type="button" onClick={loadDrafts} className="w-full flex flex-col items-center justify-center gap-2 p-6 border border-dashed border-border rounded-lg hover:border-foreground/30 hover:bg-muted/40 transition-colors">
              <div className="flex items-center justify-center rounded-md" style={{ width: 40, height: 40, backgroundColor: providerColor }}>
                <ProviderLogo size={22} />
              </div>
              <p className="text-sm font-semibold text-foreground">Load drafts from {providerName}</p>
              <p className="text-xs text-muted-foreground">Click to fetch your saved drafts</p>
            </button>
          )}

          {draftsLoading && (
            <div className="flex items-center justify-center gap-3 py-8 border border-border rounded-lg">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Fetching your drafts…</p>
            </div>
          )}

          {draftsLoaded && (
            <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
              {drafts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => pickDraft(d.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors ${selectedDraftId === d.id ? 'bg-foreground/[0.05]' : 'hover:bg-muted/50'}`}
                >
                  <div className={`mt-0.5 size-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedDraftId === d.id ? 'border-foreground bg-foreground' : 'border-muted-foreground/30'}`}>
                    {selectedDraftId === d.id && <Check className="size-2.5 text-background" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p dir="auto" className="text-sm font-semibold text-foreground truncate">{d.subject || '(no subject)'}</p>
                  </div>
                  {d.date && <span className="text-[11px] text-muted-foreground font-mono shrink-0 mt-0.5">{d.date}</span>}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>or use a template</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <SectionLabel>Templates</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FIGMA_TEMPLATES.map((t) => (
            <SelectCard key={t.id} selected={templateId === t.id} onClick={() => pickTemplate(t.id)} className="p-3.5">
              <span className="text-sm font-semibold text-foreground">{t.name}</span>
              <span className="text-xs text-muted-foreground mt-0.5">{t.desc}</span>
            </SelectCard>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {(selectedDraftId || templateId || template.subject || template.body) && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            <Field label="Subject line">
              <TextInput dir="auto" value={template.subject} onChange={(v) => onChange({ ...template, subject: v })} placeholder="Enter email subject…" icon={Mail} />
            </Field>

            <Field label="Body">
              <div className="space-y-1.5">
                <div className="flex justify-end">
                  <button type="button" onClick={() => setPreviewMode(!previewMode)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {previewMode ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    {previewMode ? 'Edit' : 'Preview'}
                  </button>
                </div>
                {previewMode ? (
                  <div className="min-h-56 p-4 bg-input-background border border-border rounded-md">
                    <pre dir="auto" className="text-sm text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                      {fullBody || <span className="text-muted-foreground italic">No content yet</span>}
                    </pre>
                  </div>
                ) : (
                  <textarea
                    dir="auto"
                    value={template.body}
                    onChange={(e) => onChange({ ...template, body: e.target.value })}
                    placeholder="Write your email content here…"
                    rows={11}
                    className={textareaCls}
                  />
                )}
              </div>
            </Field>

            <div className="border border-border rounded-lg overflow-hidden">
              <button type="button" onClick={() => setUseSignature(!useSignature)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2">
                  <PenLine className="size-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">Signature</span>
                  <span className="text-xs text-muted-foreground">(optional)</span>
                </div>
                <div className={`size-4 rounded border-2 flex items-center justify-center transition-colors ${useSignature ? 'bg-foreground border-foreground' : 'border-muted-foreground/30'}`}>
                  {useSignature && <Check className="size-2.5 text-background" />}
                </div>
              </button>
              <AnimatePresence>
                {useSignature && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                    <div className="border-t border-border p-4">
                      <textarea
                        dir="auto"
                        value={template.signature ?? ''}
                        onChange={(e) => onChange({ ...template, signature: e.target.value })}
                        placeholder={'Jane Smith\nHead of Marketing, Acme Corp\njane@acme.com | +1 (555) 000-0000'}
                        rows={4}
                        className={`${textareaCls} resize-none`}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {placeholders.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Placeholders are replaced per recipient from your CSV or manual entry columns.
                </p>
                <div className="flex flex-wrap gap-2">
                  {placeholders.map((p) => (
                    <code key={p} className="text-xs bg-muted text-foreground px-2 py-1 rounded font-mono border border-border">{`{{${p}}}`}</code>
                  ))}
                </div>
              </div>
            )}

            <Notice>
              <p className="font-medium mb-1.5">Tip — paste HTML from a draft</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Open your draft in Gmail/Outlook → right-click the email body → <strong>Inspect</strong> → find the content container → copy inner HTML → paste here.
                Or use <TransitionLink href="/draft-id" className="font-semibold underline underline-offset-2">Draft IDs</TransitionLink> to load a draft directly.
              </p>
              <p className="text-xs mt-2">
                Need SMTP or app-password help? See the{' '}
                <TransitionLink href="/support" className="font-semibold underline underline-offset-2">Setup Guide</TransitionLink>.
              </p>
            </Notice>
          </motion.div>
        )}
      </AnimatePresence>

      <ErrorMsg msg={error} />
    </Card>
  );
}

export function validateDraftStep(template: Template): string | null {
  if (!template.subject?.trim() || !template.body?.trim()) return 'Please fill in subject and body.';
  return null;
}
