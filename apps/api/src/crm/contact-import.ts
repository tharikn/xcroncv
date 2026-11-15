import { Channel, channelKey, contactKey } from './contact.util';
import { RELATIONSHIPS } from './dto/crm.dto';

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_CHARS = 90_000;

export interface ImportRow {
  line: number; // 1-based data row (header excluded)
  status: 'NEW' | 'DUPLICATE' | 'INVALID';
  reason?: string;
  contact?: { name: string; organization?: string; role?: string; relationship: string; channels: Channel[]; tags: string[]; notes?: string };
}

/** RFC 4180-style parser: quoted fields, escaped quotes, CRLF/LF, embedded newlines. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const clean = (s: string | undefined, max: number) => (s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const norm = (h: string) => h.toLowerCase().replace(/[^a-z]+/g, '');

const ALIASES: Record<string, string[]> = {
  name: ['name', 'fullname', 'contactname'],
  first: ['firstname', 'givenname'],
  last: ['lastname', 'surname', 'familyname'],
  organization: ['company', 'organization', 'organisation', 'employer'],
  role: ['position', 'title', 'jobtitle', 'role'],
  email: ['email', 'emailaddress', 'workemail'],
  phone: ['phone', 'phonenumber', 'mobile'],
  linkedin: ['url', 'linkedin', 'linkedinurl', 'profileurl'],
  tags: ['tags', 'labels'],
  notes: ['notes', 'note', 'comments'],
  relationship: ['relationship', 'type'],
};

/**
 * Pure analysis of a user-supplied CSV (e.g. LinkedIn "Connections" export or a spreadsheet).
 * Nothing is fetched or enriched: only the columns the user supplied are mapped.
 * `existing` supplies name keys and channels of current contacts for duplicate detection (also among the file's own rows).
 */
export function analyzeContactCsv(text: string, existing: Array<{ nameKey: string; channels: unknown }>): { rows: ImportRow[]; truncated: boolean; unmappedColumns: string[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], truncated: false, unmappedColumns: [] };
  // LinkedIn exports start with a few "Notes:" lines before the header; find the first row that has a name-like column.
  let h = table.findIndex((r) => r.some((c) => ['name', 'fullname', 'firstname'].includes(norm(c))));
  if (h < 0) h = 0;
  const header = table[h].map(norm);
  const idx: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) { const i = header.findIndex((c) => names.includes(c)); if (i >= 0) idx[field] = i; }
  const mapped = new Set(Object.values(idx));
  const unmappedColumns = table[h].filter((_, i) => !mapped.has(i)).map((c) => clean(c, 40)).filter(Boolean);

  const seenKeys = new Set(existing.map((c) => c.nameKey));
  const seenChannels = new Set(existing.flatMap((c) => ((c.channels as Channel[]) ?? []).map(channelKey)));
  const data = table.slice(h + 1);
  const rows: ImportRow[] = [];
  data.slice(0, IMPORT_MAX_ROWS).forEach((r, n) => {
    const cell = (f: string, max: number) => (idx[f] === undefined ? '' : clean(r[idx[f]], max));
    const name = cell('name', 120) || [cell('first', 60), cell('last', 60)].filter(Boolean).join(' ');
    const line = n + 1;
    if (!name) { rows.push({ line, status: 'INVALID', reason: 'Missing name' }); return; }
    const channels: Channel[] = [];
    const email = cell('email', 200); const phone = cell('phone', 200); const li = cell('linkedin', 200);
    if (email) { if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) channels.push({ type: 'email', value: email }); else { rows.push({ line, status: 'INVALID', reason: 'Invalid email' }); return; } }
    if (phone) channels.push({ type: 'phone', value: phone });
    if (li) { if (/^https?:\/\//i.test(li)) channels.push({ type: 'linkedin', value: li }); }
    const rel = cell('relationship', 30).toUpperCase().replace(/\s+/g, '_');
    const contact = {
      name, organization: cell('organization', 120) || undefined, role: cell('role', 120) || undefined,
      relationship: RELATIONSHIPS.includes(rel) ? rel : 'OTHER', channels: channels.slice(0, 10),
      tags: cell('tags', 400).split(/[;|]/).map((t) => t.trim().slice(0, 40)).filter(Boolean).slice(0, 20),
      notes: cell('notes', 4000) || undefined,
    };
    const key = contactKey(contact.name, contact.organization);
    const dupChannel = contact.channels.some((c) => seenChannels.has(channelKey(c)));
    if (seenKeys.has(key) || dupChannel) { rows.push({ line, status: 'DUPLICATE', reason: 'Matches an existing or earlier contact', contact }); return; }
    seenKeys.add(key); contact.channels.forEach((c) => seenChannels.add(channelKey(c)));
    rows.push({ line, status: 'NEW', contact });
  });
  return { rows, truncated: data.length > IMPORT_MAX_ROWS, unmappedColumns };
}
