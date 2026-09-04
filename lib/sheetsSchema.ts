/**
 * lib/sheetsSchema.ts
 * رأس الأعمدة لكل تبويب في Google Sheet — يوازي CREATE TABLE سابقاً في db.ts.
 *
 * ملاحظة: send_jobs لا يحتوي gmail_token/outlook_tokens — هذه تبقى في جدول
 * صغير على Turso (lib/token-store.ts) حتى لا تُخزَّن رموز OAuth حية في الشيت.
 * المرفقات تُجزَّأ إلى خلايا ≤ ~40k حرف (حد خلية Sheets ~50k).
 */

export const TAB_HEADERS = {
  work_sessions: ['session_id', 'payload_json', 'created_at', 'updated_at'],
  send_jobs: [
    'id', 'job_id', 'kind', 'scheduled_at', 'created_at', 'status', 'label',
    'payload_json', 'error', 'results_json', 'sent_count', 'failed_count', 'total_count',
  ],
  send_recipients: ['id', 'job_id', 'email', 'recipient_json', 'status', 'error', 'sent_at'],
  campaigns: [
    'id', 'user_id', 'label', 'kind', 'status', 'scheduled_at', 'created_at', 'updated_at',
    'total_emails', 'sent_count', 'failed_count', 'smtp_config_json', 'template_json', 'error',
  ],
  campaign_recipients: [
    'id', 'campaign_id', 'email', 'recipient_json', 'status', 'error',
    'scheduled_at', 'sent_at', 'created_at',
  ],
  campaign_attachments: [
    'id', 'campaign_id', 'recipient_email', 'attachment_id', 'filename',
    'content_type', 'storage_url', 'file_size_bytes', 'created_at',
  ],
  files_handler: [
    'id', 'attachment_id', 'session_id', 'job_id', 'chunk_index', 'chunk_count',
    'filename', 'content_type', 'content_base64', 'created_at',
  ],
} as const;

export type SheetTab = keyof typeof TAB_HEADERS;
