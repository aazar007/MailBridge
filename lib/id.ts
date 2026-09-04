/** Safe ID generator — avoids crypto.randomUUID() which throws in some Safari contexts. */
export function createId(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
