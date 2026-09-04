export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  content: string;
}

export interface SmtpConfigPayload {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  delayMs: number;
}

export interface SendPayload {
  smtpConfig: SmtpConfigPayload;
  template: { subject: string; body: string; signature?: string };
  recipients: Record<string, string>[];
  useOutlookGraph?: boolean;
  useGmailApi?: boolean;
  attachmentMap?: Record<string, EmailAttachment[]>;
  sessionId?: string;
}
