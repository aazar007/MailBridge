'use client';

import { Paperclip } from 'lucide-react';
import { PRESETS, ProviderLogo } from '@/components/campaign/smtp-step';
import type { SmtpConfig } from '@/components/campaign/smtp-step';
import { Card, SectionLabel, StatCard } from '@/components/mail-ui';

interface Preview {
  to: string;
  toName: string;
  subject: string;
  body: string;
}

export function FigmaPreviewStep({
  previews,
  recipientCount,
  attachmentCount,
  smtpConfig,
}: {
  previews: Preview[];
  recipientCount: number;
  attachmentCount: number;
  smtpConfig: SmtpConfig;
}) {
  const activeLabel = PRESETS.find((p) => p.host === smtpConfig.host)?.label
    ?? (smtpConfig.host === '' ? 'Custom' : undefined);
  const provider = PRESETS.find((p) => p.label === activeLabel);
  const sample = previews[0];

  return (
    <Card title="Campaign preview" subtitle="Review everything before you send">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Recipients" value={recipientCount} />
        <StatCard label="Attachments" value={attachmentCount} />
        <StatCard label="Provider" value={provider?.label ?? '—'} adornment={provider ? <ProviderLogo preset={provider} size={14} /> : undefined} />
      </div>

      {sample && (
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-card px-5 py-4 space-y-3 border-b border-border">
            <div className="flex items-start gap-4">
              <span className="text-[11px] font-semibold text-muted-foreground w-14 pt-0.5 font-mono uppercase tracking-wider shrink-0">From</span>
              <div className="flex items-center gap-2">
                {provider ? (
                  <ProviderLogo preset={provider} size={12} />
                ) : (
                  <div className="size-4 rounded bg-muted" />
                )}
                <span className="font-mono text-sm text-foreground">
                  {smtpConfig.fromName ? `"${smtpConfig.fromName}" <${smtpConfig.user || 'sender@example.com'}>` : smtpConfig.user || 'sender@example.com'}
                </span>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="text-[11px] font-semibold text-muted-foreground w-14 pt-0.5 font-mono uppercase tracking-wider shrink-0">To</span>
              <div className="flex flex-wrap gap-1.5">
                {previews.slice(0, 6).map((p, i) => (
                  <span key={i} className="px-2 py-0.5 bg-muted border border-border rounded text-xs font-mono text-foreground">
                    {p.toName || p.to}
                  </span>
                ))}
                {previews.length > 6 && (
                  <span className="px-2 py-0.5 bg-muted border border-border rounded text-xs font-mono text-muted-foreground">
                    +{previews.length - 6} more
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="text-[11px] font-semibold text-muted-foreground w-14 pt-0.5 font-mono uppercase tracking-wider shrink-0">Subject</span>
              <span dir="auto" className="text-sm font-semibold text-foreground">{sample.subject || <span className="italic text-muted-foreground">No subject</span>}</span>
            </div>
            {attachmentCount > 0 && (
              <div className="flex items-start gap-4">
                <span className="text-[11px] font-semibold text-muted-foreground w-14 pt-0.5 font-mono uppercase tracking-wider shrink-0">Files</span>
                <span className="flex items-center gap-1 px-2 py-0.5 bg-muted border border-border rounded text-xs font-mono text-muted-foreground">
                  <Paperclip className="size-2.5" />
                  {attachmentCount} attached
                </span>
              </div>
            )}
          </div>
          <div className="px-5 py-5 bg-background">
            <iframe
              srcDoc={sample.body}
              className="w-full border-0"
              style={{ minHeight: 140 }}
              sandbox="allow-same-origin"
              title="Email preview"
            />
          </div>
        </div>
      )}

      {previews.length > 1 && (
        <div className="space-y-3">
          <SectionLabel>All previews ({previews.length})</SectionLabel>
          {previews.slice(1).map((p, i) => (
            <div key={i} className="border border-border rounded-lg overflow-hidden">
              <div className="bg-card px-4 py-2 border-b border-border text-xs font-mono text-muted-foreground">
                To: {p.toName || p.to} · {p.subject}
              </div>
              <iframe srcDoc={p.body} className="w-full border-0" style={{ minHeight: 100 }} sandbox="allow-same-origin" title={`Preview ${i + 2}`} />
            </div>
          ))}
        </div>
      )}

      {(!sample?.subject || recipientCount === 0) && (
        <div className="flex items-start gap-3 p-4 border border-foreground/20 rounded-lg bg-foreground/[0.03] text-sm text-foreground">
          {!sample?.subject && <p>Missing subject line</p>}
          {recipientCount === 0 && <p>No recipients added</p>}
        </div>
      )}
    </Card>
  );
}
