/**
 * Bounds a promise's wait time. Gmail API (googleapis/gaxios), Microsoft
 * Graph, and nodemailer/SMTP calls have no built-in timeout — a stalled
 * network response hangs until Vercel's hard function limit kills the whole
 * invocation, wiping out every recipient still queued behind it. This can't
 * cancel the underlying request, but it stops it from blocking the rest of
 * the batch so one bad connection fails just that one send.
 */
// Fetching a signature / access token / verifying SMTP should be quick metadata calls.
export const SETUP_CALL_TIMEOUT_MS = 15_000;
// Actually sending one email (possibly with attachments) gets a bit more room.
export const SEND_CALL_TIMEOUT_MS = 20_000;

export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
