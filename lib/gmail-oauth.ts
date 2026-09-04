import { google } from 'googleapis';
import { gmail_v1 } from 'googleapis';
import type { EmailAttachment } from '@/lib/send-types';

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.settings.basic',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

export function createOAuth2Client(redirectUri = 'http://localhost:3000/api/auth/callback') {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

export function getGmailRedirectUri(origin: string) {
  const { hostname } = new URL(origin);
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return `${origin}/api/auth/callback`;
  }
  return process.env.GOOGLE_REDIRECT_URI ?? `${origin}/api/auth/callback`;
}

export function getGmailClient(tokenJson: string) {
  const auth = createOAuth2Client();
  auth.setCredentials(JSON.parse(tokenJson));
  return google.gmail({ version: 'v1', auth });
}

/** Recursively find the HTML body in a MIME payload (preferred over plain text). */
function decodePartData(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf-8');
}

function findHtmlPart(payload: gmail_v1.Schema$MessagePart): string {
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return decodePartData(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const html = findHtmlPart(part);
      if (html) return html;
    }
  }
  return '';
}

function findPlainPart(payload: gmail_v1.Schema$MessagePart): string {
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return decodePartData(payload.body.data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const plain = findPlainPart(part);
      if (plain) return plain;
    }
  }
  return '';
}

function plainToHtml(text: string): string {
  return `<p>${text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
}

export function extractBody(payload: gmail_v1.Schema$MessagePart): string {
  if (!payload) return '';

  const html = findHtmlPart(payload);
  if (html) return html;

  const plain = findPlainPart(payload);
  if (plain) return plainToHtml(plain);

  return '';
}

export function getHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string
): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
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

function encodeSubject(subject: string): string {
  if (/^[\x20-\x7E]*$/.test(subject)) return subject;
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`;
}

function formatAddress(email: string, name?: string): string {
  if (!name) return email;
  return `"${name.replace(/"/g, '\\"')}" <${email}>`;
}

function buildRawEmail(payload: {
  fromEmail: string;
  fromName?: string;
  to: string;
  toName?: string;
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
}): string {
  const attachments = payload.attachments ?? [];
  const text = htmlToText(payload.html);
  const headers = [
    `From: ${formatAddress(payload.fromEmail, payload.fromName)}`,
    `To: ${formatAddress(payload.to, payload.toName)}`,
    `Subject: ${encodeSubject(payload.subject)}`,
    'MIME-Version: 1.0',
  ];

  if (attachments.length === 0) {
    const boundary = `alt_${Date.now().toString(36)}`;
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(text, 'utf-8').toString('base64'),
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(payload.html, 'utf-8').toString('base64'),
      `--${boundary}--`,
    ].join('\r\n');
  }

  const mixed = `mixed_${Date.now().toString(36)}`;
  const alt = `alt_${Date.now().toString(36)}_2`;
  const lines = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    '',
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(text, 'utf-8').toString('base64'),
    `--${alt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(payload.html, 'utf-8').toString('base64'),
    `--${alt}--`,
  ];

  for (const att of attachments) {
    lines.push(
      `--${mixed}`,
      `Content-Type: ${att.contentType}; name="${att.filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${att.filename}"`,
      '',
      att.content,
    );
  }

  lines.push(`--${mixed}--`);
  return lines.join('\r\n');
}

export async function getGmailProfile(tokenJson: string): Promise<{ email: string; displayName: string }> {
  const auth = createOAuth2Client();
  auth.setCredentials(JSON.parse(tokenJson));
  const oauth2 = google.oauth2({ version: 'v2', auth });
  const { data } = await oauth2.userinfo.get();
  return {
    email: data.email ?? '',
    displayName: data.name ?? '',
  };
}

export async function getGmailSignatureInfo(
  tokenJson: string,
  fromEmail?: string,
): Promise<{ signature: string; sendAsEmail: string }> {
  const gmail = getGmailClient(tokenJson);
  const { data } = await gmail.users.settings.sendAs.list({ userId: 'me' });

  if (!data.sendAs || data.sendAs.length === 0) {
    return { signature: '', sendAsEmail: '' };
  }

  const matched = fromEmail
    ? data.sendAs.find((s) => s.sendAsEmail?.toLowerCase() === fromEmail.toLowerCase())
    : null;
  const primary = matched ?? data.sendAs.find((s) => s.isPrimary || s.isDefault) ?? data.sendAs[0];

  return {
    signature: primary.signature ?? '',
    sendAsEmail: primary.sendAsEmail ?? '',
  };
}

export async function getGmailSignature(tokenJson: string, fromEmail?: string): Promise<string> {
  try {
    const { signature, sendAsEmail } = await getGmailSignatureInfo(tokenJson, fromEmail);
    console.log(`[getGmailSignature] Selected alias: ${sendAsEmail}, signature length: ${signature.length}`);
    return signature;
  } catch (err) {
    console.error('[getGmailSignature] failed:', err);
    return '';
  }
}

export async function sendGmailEmail(
  tokenJson: string,
  payload: {
    to: string;
    toName?: string;
    subject: string;
    html: string;
    fromName?: string;
    fromEmail?: string;
    attachments?: EmailAttachment[];
  }
): Promise<void> {
  if (!payload.fromEmail) throw new Error('Sender email is required');

  const gmail = getGmailClient(tokenJson);
  const raw = Buffer.from(buildRawEmail({
    fromEmail: payload.fromEmail,
    fromName: payload.fromName,
    to: payload.to,
    toName: payload.toName,
    subject: payload.subject,
    html: payload.html,
    attachments: payload.attachments,
  })).toString('base64url');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });
}
