-- MailBridge — Turso / libSQL schema (tokens only)
-- Auto-created on first request via lib/db.ts ensureSchema().
-- This file is documentation only; changes here have no effect.
--
-- Everything else (work_sessions, send_jobs, send_recipients, campaigns,
-- campaign_recipients, campaign_attachments, files_handler) lives in
-- Google Sheets — see lib/sheetsSchema.ts.
-- ─────────────────────────────────────────────────────────────────────────────

-- Live Gmail / Outlook OAuth tokens for scheduled sends & campaigns.
-- Key is job_id (legacy) or campaign_id. Kept out of Sheets on purpose.
CREATE TABLE IF NOT EXISTS send_tokens (
  id             TEXT PRIMARY KEY,
  gmail_token    TEXT,
  outlook_tokens TEXT
);
