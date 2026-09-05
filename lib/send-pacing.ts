/**
 * Server-side floor for delay-between-sends. The client input
 * (components/campaign/smtp-step.tsx) has no minimum — a user can type 0.
 * Bulk-sending through a personal Gmail/Outlook account too fast is a
 * common trigger for provider-side throttling and recipient spam filters,
 * so every send path clamps the configured delay up to this floor rather
 * than trusting whatever the client sent.
 */
export const MIN_DELAY_MS = 2000;

export function effectiveDelayMs(configuredDelayMs: number | undefined): number {
  return Math.max(MIN_DELAY_MS, Number(configuredDelayMs) || 0);
}
