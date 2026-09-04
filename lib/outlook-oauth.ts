const AUTH_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

import type { EmailAttachment } from '@/lib/send-types';
import { appendSignatureIfMissing, extractAroundMarker, splitEmbeddedSignature } from '@/lib/email-body';

export function getOutlookRedirectUri(origin: string) {
  const { hostname } = new URL(origin);
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return `${origin}/api/auth/microsoft/callback`;
  }
  return process.env.MICROSOFT_REDIRECT_URI ?? `${origin}/api/auth/microsoft/callback`;
}

export function getMicrosoftSecretIssue(secret: string | undefined) {
  if (!secret?.trim()) {
    return 'MICROSOFT_CLIENT_SECRET is not set. In Azure, create a client secret and paste the Value (not the Secret ID) into Vercel env vars.';
  }
  if (UUID_RE.test(secret.trim())) {
    return 'MICROSOFT_CLIENT_SECRET looks like a Secret ID. Azure requires the Secret Value (shown only once when you create the secret).';
  }
  return null;
}

export function getAuthUrl(redirectUri: string, returnTo = '/main'): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access',
    response_mode: 'query',
    state: returnTo,
  });
  return `${AUTH_BASE}/authorize?${params}`;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const tokens = await exchangeCodeForTokens(code, redirectUri);
  return tokens.access_token;
}

export interface OutlookTokenSet {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export async function exchangeCodeForTokens(code: string, redirectUri: string): Promise<OutlookTokenSet> {
  const secretIssue = getMicrosoftSecretIssue(process.env.MICROSOFT_CLIENT_SECRET);
  if (secretIssue) throw new Error(secretIssue);

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description ?? data.error);
  return {
    access_token: data.access_token as string,
    refresh_token: data.refresh_token as string | undefined,
    expires_in: data.expires_in as number | undefined,
  };
}

export async function refreshOutlookAccessToken(refreshToken: string): Promise<OutlookTokenSet> {
  const secretIssue = getMicrosoftSecretIssue(process.env.MICROSOFT_CLIENT_SECRET);
  if (secretIssue) throw new Error(secretIssue);

  const res = await fetch(`${AUTH_BASE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID!,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error_description ?? data.error);
  return {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string | undefined) ?? refreshToken,
    expires_in: data.expires_in as number | undefined,
  };
}

export async function getValidOutlookAccessToken(tokensJson: string): Promise<string> {
  let parsed: OutlookTokenSet;
  try {
    parsed = JSON.parse(tokensJson) as OutlookTokenSet;
  } catch {
    return tokensJson;
  }

  if (!parsed.refresh_token) {
    return parsed.access_token;
  }

  const refreshed = await refreshOutlookAccessToken(parsed.refresh_token);
  return refreshed.access_token;
}

export async function getOutlookProfile(token: string): Promise<{ email: string; displayName: string }> {
  const res = await fetch(`${GRAPH_BASE}/me?$select=mail,userPrincipalName,displayName`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const email = (data.mail as string) || (data.userPrincipalName as string) || '';
  return {
    email,
    displayName: (data.displayName as string) || '',
  };
}

export async function listOutlookDrafts(token: string): Promise<{ id: string; subject: string; date: string }[]> {
  const res = await fetch(
    `${GRAPH_BASE}/me/mailFolders/drafts/messages?$select=id,subject,createdDateTime&$top=100&$orderby=createdDateTime desc`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data.value ?? []).map((m: any) => ({
    id: m.id as string,
    subject: (m.subject as string) || '(no subject)',
    date: m.createdDateTime as string,
  }));
}

export async function getOutlookSignature(token: string): Promise<string> {
  const marker = `<!--mailbridge-sig-${Date.now()}-->`;
  const createRes = await fetch(`${GRAPH_BASE}/me/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subject: ' ',
      body: { contentType: 'HTML', content: marker },
    }),
  });

  if (!createRes.ok) return '';

  const created = await createRes.json();
  const id = created.id as string | undefined;
  if (!id) return '';

  try {
    const getRes = await fetch(
      `${GRAPH_BASE}/me/messages/${encodeURIComponent(id)}?$select=body`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await getRes.json();
    if (data.error) return '';
    const content = (data.body?.content as string) ?? '';
    return extractAroundMarker(content, marker);
  } finally {
    await fetch(`${GRAPH_BASE}/me/messages/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
}

export async function getOutlookDraft(token: string, id: string): Promise<{ subject: string; body: string; signature: string }> {
  const res = await fetch(
    `${GRAPH_BASE}/me/messages/${encodeURIComponent(id)}?$select=subject,body`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Prefer: 'outlook.body-content-type="html"',
      },
    },
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);

  let body = (data.body?.content as string) ?? '';
  if (data.body?.contentType === 'text') {
    body = `<p>${body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</p>`;
  }

  const outlookSignature = await getOutlookSignature(token);
  const split = splitEmbeddedSignature(body);

  return {
    subject: (data.subject as string) ?? '',
    body: split.body,
    signature: split.signature || outlookSignature,
  };
}

export async function sendOutlookEmail(
  token: string,
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
  const message: Record<string, unknown> = {
    subject: payload.subject,
    body: { contentType: 'HTML', content: payload.html },
    toRecipients: [{
      emailAddress: {
        address: payload.to,
        ...(payload.toName ? { name: payload.toName } : {}),
      },
    }],
  };

  if (payload.attachments?.length) {
    message.attachments = payload.attachments.map((a) => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType,
      contentBytes: a.content,
    }));
  }

  if (payload.fromEmail) {
    message.from = {
      emailAddress: {
        address: payload.fromEmail,
        ...(payload.fromName ? { name: payload.fromName } : {}),
      },
    };
  }

  const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message ?? `Microsoft Graph send failed (${res.status})`);
  }
}
