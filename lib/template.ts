const NAME_KEYS = [
  'name',
  'Name',
  'first_name',
  'First_Name',
  'FirstName',
  'firstname',
  'last_name',
  'Last_Name',
  'LastName',
  'lastname',
  'full_name',
  'Full_Name',
  'FullName',
];

const NAME_PLACEHOLDER = /name|first|last|full/i;

export function getRecipientName(recipient: Record<string, string>): string {
  for (const key of NAME_KEYS) {
    const val = recipient[key]?.trim();
    if (val) return val;
  }

  for (const [key, val] of Object.entries(recipient)) {
    if (key === 'email' || !val?.trim()) continue;
    if (NAME_PLACEHOLDER.test(key)) return val.trim();
  }

  return '';
}

export function isNamePlaceholder(key: string): boolean {
  return NAME_PLACEHOLDER.test(key);
}

function enrichRecipientData(data: Record<string, string>): Record<string, string> {
  const enriched = { ...data };
  const name = getRecipientName(data);
  if (!name) return enriched;

  for (const key of NAME_KEYS) {
    if (!enriched[key]?.trim()) enriched[key] = name;
  }
  return enriched;
}

function cleanupMissingNamePhrases(text: string): string {
  return text
    .replace(/\b(Dear|Hi|Hello|Hey)\s+,/gi, '$1,')
    .replace(/\b(عزيزي|مرحبا|أهلا)\s+,/g, '$1،')
    .replace(/,\s*,+/g, ',')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function replacePlaceholders(
  text: string,
  data: Record<string, string>,
): string {
  const enriched = enrichRecipientData(data);

  const replaced = text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = enriched[key]?.trim();
    if (val) return val;
    if (isNamePlaceholder(key)) return '';
    return match;
  });

  return cleanupMissingNamePhrases(replaced);
}

export function extractPlaceholders(text: string): string[] {
  const matches = [...text.matchAll(/\{\{(\w+)\}\}/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

export function placeholderNeedsColumn(key: string): boolean {
  return key !== 'email' && !isNamePlaceholder(key);
}
