/** Prefer HTML parts so multipart/alternative drafts keep formatting and signatures. */
export function stripHtmlTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeComparable(html: string): string {
  return stripHtmlTags(html).toLowerCase();
}

export function signatureAlreadyPresent(body: string, signature: string): boolean {
  const sig = signature.trim();
  if (!sig) return true;

  const normSig = normalizeComparable(sig);
  if (!normSig) return true;

  const normBody = normalizeComparable(body);
  if (normBody.includes(normSig)) return true;

  if (/gmail_signature|outlook_signature|signature/i.test(body) && normBody.length > normSig.length) {
    return true;
  }

  return false;
}

export function splitEmbeddedSignature(html: string): { body: string; signature: string } {
  const patterns = [
    /<div[^>]*class="[^"]*gmail_signature[^"]*"[^>]*>[\s\S]*?<\/div>/i,
    /<div[^>]*id="Signature"[^>]*>[\s\S]*?<\/div>/i,
    /<div[^>]*class="[^"]*signature[^"]*"[^>]*>[\s\S]*?<\/div>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      return {
        body: html.replace(match[0], '').trim(),
        signature: match[0].trim(),
      };
    }
  }

  return { body: html, signature: '' };
}

export function appendSignatureIfMissing(body: string, signature: string): string {
  const sig = signature.trim();
  if (!sig || signatureAlreadyPresent(body, sig)) return body;

  const trimmedBody = body.trim();
  if (!trimmedBody) return sig;
  return `${trimmedBody}<br><br>${sig}`;
}

/**
 * Appends an <img> tag for every attachment marked inline (that the body
 * doesn't already reference), so "insert into email" doesn't require the
 * user to hand-edit HTML — the image just shows up, like a pasted image.
 *
 * Default src is the Content-ID convention (`cid:{attachment.id}`), matching
 * the header each send path sets on the actual inline MIME part. The
 * in-browser Preview step can't resolve cid: URLs (that only works inside a
 * real email client rendering the actual MIME message), so it passes a
 * `srcFor` that builds a data: URI from the attachment's own base64 content
 * instead — same body-injection logic, different pixel source.
 */
export function injectInlineImages(
  body: string,
  attachments: Array<{ id: string; filename: string; inline?: boolean; contentType?: string; content?: string }>,
  srcFor: (a: { id: string; filename: string; contentType?: string; content?: string }) => string = (a) => `cid:${a.id}`,
): string {
  const toInsert = attachments.filter((a) => a.inline && !body.includes(`cid:${a.id}`));
  if (toInsert.length === 0) return body;

  const images = toInsert
    .map((a) => `<img src="${srcFor(a)}" alt="${a.filename.replace(/"/g, '&quot;')}" style="max-width:100%">`)
    .join('<br>');

  const trimmedBody = body.trim();
  return trimmedBody ? `${trimmedBody}<br><br>${images}` : images;
}

export function extractAroundMarker(content: string, marker: string): string {
  const idx = content.indexOf(marker);
  if (idx === -1) return '';

  const before = content.slice(0, idx).trim();
  const after = content.slice(idx + marker.length).trim();
  if (before && after) {
    return before.length >= after.length ? before : after;
  }
  return before || after;
}
