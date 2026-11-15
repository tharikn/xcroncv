import { zipSync, strToU8 } from 'fflate';

/** Escape text for XML and drop characters that are illegal in XML 1.0 (control chars would corrupt the package). */
export function xml(s: string | undefined | null): string {
  return String(s ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

/** Build an OOXML package (zip). `[Content_Types].xml` must be first for strict consumers. */
export function pack(files: Record<string, string>): Buffer {
  const ordered: Record<string, Uint8Array> = {};
  const first = '[Content_Types].xml';
  if (files[first] !== undefined) ordered[first] = strToU8(files[first]);
  for (const [k, v] of Object.entries(files)) if (k !== first) ordered[k] = strToU8(v);
  return Buffer.from(zipSync(ordered, { level: 6 }));
}
