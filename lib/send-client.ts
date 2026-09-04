import type { SendPayload } from '@/lib/send-types';

export interface SendProgressEvent {
  type: 'sent' | 'error' | 'start' | 'done';
  email?: string;
  success?: boolean;
  error?: string;
  message?: string;
  fatal?: boolean;
  total?: number;
}

export async function executeSend(
  payload: SendPayload,
  onEvent: (ev: SendProgressEvent) => void,
): Promise<void> {
  const res = await fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch { /* ignore */ }
    }
  }
}
