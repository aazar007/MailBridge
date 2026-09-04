export const MAX_TEMP_RECIPIENTS = 50;
export const MAX_TEMP_FILES = 50;

export function assertRecipientLimit(count: number): void {
  if (count > MAX_TEMP_RECIPIENTS) {
    throw new Error(`Maximum ${MAX_TEMP_RECIPIENTS} recipients allowed per session.`);
  }
}

export function assertFileLimit(count: number): void {
  if (count > MAX_TEMP_FILES) {
    throw new Error(`Maximum ${MAX_TEMP_FILES} files allowed. Remove files before adding more.`);
  }
}
