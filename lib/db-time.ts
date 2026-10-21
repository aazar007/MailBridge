import type { TimestampString } from '@prisma/orm-postgres/target/codec-types';

/**
 * Timestamp helpers for the Prisma 8 client.
 *
 * Prisma 8 reads the schema's `DateTime` columns (`timestamp(3)`, stored in
 * UTC) as strings such as "2026-09-14 10:00:00.123" and accepts strings on
 * write. The client types those columns as a branded `TimestampString<3>`, so
 * plain strings don't compile — every Date → column conversion has to go
 * through toDbTimestamp(). The stores' public API still deals in `Date`
 * objects / ISO strings.
 */

/** Date | ISO string | epoch ms → the value the Prisma 8 client reads and writes. */
export function toDbTimestamp(value: Date | string | number): TimestampString<3> {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${String(value)}`);
  }
  return date.toISOString().replace('T', ' ').replace('Z', '') as TimestampString<3>;
}

/** Same, but passes null/undefined/'' through as null (nullable columns). */
export function toDbTimestampOrNull(
  value: Date | string | number | null | undefined,
): TimestampString<3> | null {
  return value === null || value === undefined || value === '' ? null : toDbTimestamp(value);
}

/** String read from a timestamp column → Date (the value is UTC). */
export function fromDbTimestamp(value: string): Date {
  const trimmed = value.trim();
  // Already carries an offset ("…Z" or "…+00:00")? Parse as is; otherwise it is UTC.
  const hasZone = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(trimmed);
  const iso = trimmed.replace(' ', 'T');
  const date = new Date(hasZone ? iso : `${iso}Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp from database: ${value}`);
  }
  return date;
}

/** String read from a timestamp column → ISO-8601 string. */
export function dbTimestampToIso(value: string): string {
  return fromDbTimestamp(value).toISOString();
}
