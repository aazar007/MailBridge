export interface EmailAttachment {
  id: string;
  filename: string;
  contentType: string;
  content: string;
  /** Show inside the email body (like a pasted image) instead of as a
   *  downloadable file. Referenced via Content-ID (cid:{id}) in the HTML. */
  inline?: boolean;
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
