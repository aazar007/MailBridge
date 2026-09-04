import type { EmailAttachment, SendPayload } from '@/lib/send-types';

export interface StoredScheduledJob {
  id: string;
  scheduledAt: string;
  createdAt: string;
  status: 'pending' | 'processing' | 'partial' | 'completed' | 'failed';
  label: string;
  payload: SendPayload;
  gmailToken?: string;
  outlookTokens?: string;
  error?: string;
  results?: { email: string; success: boolean; error?: string }[];
  sentCount?: number;
  failedCount?: number;
  totalCount?: number;
}

export interface SendResultItem {
  email: string;
  success: boolean;
  error?: string;
}

export function ensureDirection(html: string): string {
  if (/dir\s*=/i.test(html)) return html;
  if (/<html\b/i.test(html)) return html.replace(/<html\b([^>]*)>/i, '<html$1 dir="auto">');
  if (/<body\b/i.test(html)) return html.replace(/<body\b([^>]*)>/i, '<body$1 dir="auto">');
  return `<div dir="auto">${html}</div>`;
}
