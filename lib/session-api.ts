import type { WorkSessionData } from '@/lib/work-session';

const SESSION_API = '/api/session';
export const SESSION_STORAGE_KEY = 'mailbridge_session_id';

export function getOrCreateSessionId(createId: () => string): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    id = createId();
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}

export function clearSessionId(): void {
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

export async function fetchWorkSession(sessionId: string): Promise<WorkSessionData | null> {
  const res = await fetch(`${SESSION_API}?sessionId=${encodeURIComponent(sessionId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load session');
  const body = await res.json();
  return body.session as WorkSessionData;
}

export async function saveWorkSessionRemote(
  sessionId: string,
  data: WorkSessionData,
): Promise<void> {
  const res = await fetch(SESSION_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, ...data }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to save session');
  }
}

export async function deleteWorkSessionRemote(sessionId: string): Promise<void> {
  await fetch(SESSION_API, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  });
  clearSessionId();
}
