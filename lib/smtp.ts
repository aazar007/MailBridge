import nodemailer from 'nodemailer';
import type { EmailAttachment } from '@/lib/send-types';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  delayMs: number;
}

export function createTransporter(config: SmtpConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    tls: { rejectUnauthorized: false },
  });
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export async function sendEmail(
  transporter: nodemailer.Transporter,
  config: SmtpConfig,
  payload: { to: string; toName?: string; subject: string; html: string; attachments?: EmailAttachment[] }
) {
  const toFormatted = payload.toName
    ? `"${payload.toName}" <${payload.to}>`
    : payload.to;

  return transporter.sendMail({
    from: `"${config.fromName}" <${config.user}>`,
    to: toFormatted,
    subject: payload.subject,
    html: payload.html,
    text: htmlToText(payload.html),
    attachments: payload.attachments?.map((a) => ({
      filename: a.filename,
      content: Buffer.from(a.content, 'base64'),
      contentType: a.contentType,
    })),
  });
}
