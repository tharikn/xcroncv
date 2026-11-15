import { ConflictException, NotFoundException } from '@nestjs/common';
import { channelKey, contactKey, findDuplicate } from '../src/crm/contact.util';
import { CrmService } from '../src/crm/crm.service';
import { decryptNote, encryptNote } from '../src/crm/notes-crypto';

const u1 = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's1' };
const u2 = { userId: 'u2', tenantId: 't1', issuer: 'i', subject: 's2' };

/** Tiny in-memory Prisma fake that honours the where-clauses the service uses. */
function fakePrisma() {
  const db = { contacts: [] as any[], activities: [] as any[], tasks: [] as any[], links: [] as any[] };
  let n = 0; const id = () => `id-${++n}`;
  const match = (row: any, where: any = {}) => Object.entries(where).every(([k, v]) => (typeof v === 'object' && v !== null ? true : row[k] === v));
  const table = (rows: any[], defaults: Record<string, any> = {}, extra: Record<string, any> = {}) => ({
    findFirst: async ({ where }: any) => rows.find((r) => match(r, where)) ?? null,
    findMany: async ({ where }: any = {}) => rows.filter((r) => match(r, where)),
    create: async ({ data }: any) => { const r = { id: id(), createdAt: new Date(), updatedAt: new Date(), ...defaults, ...data }; rows.push(r); return r; },
    update: async ({ where, data }: any) => { const r = rows.find((x) => x.id === where.id); Object.assign(r, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))); return r; },
    delete: async ({ where }: any) => { rows.splice(rows.findIndex((x) => x.id === where.id), 1); },
    count: async ({ where }: any) => rows.filter((r) => match(r, where)).length,
    ...extra,
  });
  const prisma: any = {
    careerContact: table(db.contacts), jobActivity: table(db.activities), followUpTask: table(db.tasks, { status: 'OPEN' }), contactLink: table(db.links),
  };
  return { prisma, db };
}

describe('notes encryption', () => {
  it('round-trips and is not plaintext', () => {
    const enc = encryptNote('met at conf; prefers email', 'k1');
    expect(enc).not.toContain('conf');
    expect(decryptNote(enc, 'k1')).toBe('met at conf; prefers email');
  });
  it('uses a fresh IV and rejects tampering or a wrong key', () => {
    expect(encryptNote('x', 'k1')).not.toBe(encryptNote('x', 'k1'));
    const bad = Buffer.from(encryptNote('secret', 'k1'), 'base64'); bad[bad.length - 1] ^= 1;
    expect(() => decryptNote(bad.toString('base64'), 'k1')).toThrow();
    expect(() => decryptNote(encryptNote('secret', 'k1'), 'k2')).toThrow();
  });
});

describe('deduplication helpers', () => {
  it('normalises name+organisation and channels', () => {
    expect(contactKey('  Jane  DOE ', 'Acme, Inc.')).toBe(contactKey('jane doe', 'acme inc'));
    expect(channelKey({ type: 'phone', value: '+44 (20) 7946-0000' })).toBe('phone:+442079460000');
    expect(channelKey({ type: 'email', value: ' A@B.com ' })).toBe('email:a@b.com');
  });
  it('finds duplicates by key or shared channel, ignoring self', () => {
    const ex = [{ id: 'a', nameKey: 'jane|acme', channels: [{ type: 'email', value: 'j@a.com' }] }];
    expect(findDuplicate(ex, 'jane|acme', [])?.id).toBe('a');
    expect(findDuplicate(ex, 'other|x', [{ type: 'email', value: 'J@A.com' }])?.id).toBe('a');
    expect(findDuplicate(ex, 'jane|acme', [], 'a')).toBeUndefined();
    expect(findDuplicate(ex, 'other|x', [])).toBeUndefined();
  });
});

describe('CrmService', () => {
  let svc: CrmService; let db: ReturnType<typeof fakePrisma>['db'];
  beforeEach(() => { const f = fakePrisma(); db = f.db; svc = new CrmService(f.prisma); });

  it('stores notes encrypted and returns them decrypted only on detail', async () => {
    const c = await svc.createContact(u1, { name: 'Jane Doe', organization: 'Acme', notes: 'private note' });
    expect(db.contacts[0].notesEnc).toBeTruthy();
    expect(db.contacts[0].notesEnc).not.toContain('private');
    expect(c.notes).toBe('private note');
    expect(JSON.stringify(c)).not.toContain('notesEnc');
    const list = await svc.listContacts(u1);
    expect((list[0] as any).notes).toBeUndefined();
  });

  it('rejects duplicates and reports the existing id', async () => {
    await svc.createContact(u1, { name: 'Jane Doe', organization: 'Acme' });
    await expect(svc.createContact(u1, { name: 'jane doe', organization: 'ACME' })).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.createContact(u1, { name: 'Other', channels: [] })).resolves.toBeDefined();
  });

  it('isolates users: others cannot read, update, delete or link a contact', async () => {
    const c = await svc.createContact(u1, { name: 'Jane' });
    await expect(svc.getContact(u2, c.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.updateContact(u2, c.id, { role: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.deleteContact(u2, c.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.addLink(u2, c.id, { kind: 'JOB', externalRef: 'j1' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.createActivity(u2, { contactId: c.id, type: 'NOTE', occurredAt: '2026-01-01', summary: 's' })).rejects.toBeInstanceOf(NotFoundException);
    expect(await svc.listContacts(u2)).toHaveLength(0);
  });

  it('records activities and tasks; completing a task sets completedAt', async () => {
    const c = await svc.createContact(u1, { name: 'Jane' });
    const a = await svc.createActivity(u1, { contactId: c.id, type: 'OUTREACH', occurredAt: '2026-01-02T10:00:00Z', summary: 'Sent intro' });
    expect(a.userId).toBe('u1');
    const t = await svc.createTask(u1, { contactId: c.id, title: 'Follow up', dueAt: '2026-01-09T10:00:00Z' });
    const done = await svc.updateTask(u1, t.id, { status: 'DONE' });
    expect(done.completedAt).toBeInstanceOf(Date);
    const reopened = await svc.updateTask(u1, t.id, { status: 'OPEN' });
    expect(reopened.completedAt).toBeNull();
    await expect(svc.updateTask(u2, t.id, { status: 'DONE' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.updateActivity(u2, a.id, { summary: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('counts open/overdue/done tasks for analytics', async () => {
    await svc.createTask(u1, { title: 'old', dueAt: '2020-01-01T00:00:00Z' });
    await svc.createTask(u1, { title: 'future', dueAt: '2099-01-01T00:00:00Z' });
    const d = await svc.createTask(u1, { title: 'done', dueAt: '2020-01-01T00:00:00Z' });
    await svc.updateTask(u1, d.id, { status: 'DONE' });
    expect(await svc.taskStats(u1, new Date('2026-01-01'))).toEqual({ open: 2, overdue: 1, done: 1 });
    expect(await svc.taskStats(u2)).toEqual({ open: 0, overdue: 0, done: 0 });
  });

  it('exports only the caller\'s data', async () => {
    await svc.createContact(u1, { name: 'Mine', notes: 'n1' });
    await svc.createContact(u2, { name: 'Theirs' });
    const x = await svc.exportAll(u1);
    expect(x.contacts.map((c: any) => c.name)).toEqual(['Mine']);
    expect(x.contacts[0].notes).toBe('n1');
  });
});

describe('CSV import (consent-gated)', () => {
  const csv = [
    'Notes:,,,', 'When exporting your connections,,,', '',
    'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
    'Jane,Doe,https://www.linkedin.com/in/jane,jane@acme.com,Acme,Recruiter,01 Jan 2026',
    'Bob,"O""Brien, Jr",,bob@x.com,Globex,Engineer,02 Jan 2026',
    ',,,,Nobody Inc,CEO,',
    'Eve,Bad,,not-an-email,Z,Y,',
    'Jane,Doe,,jane@acme.com,Acme,Recruiter,',
  ].join('\r\n');
  const { analyzeContactCsv, parseCsv } = require('../src/crm/contact-import');

  it('parses quotes, escaped quotes and embedded commas', () => {
    expect(parseCsv('a,"b ""q"", c",d\n1,2,3')).toEqual([['a', 'b "q", c', 'd'], ['1', '2', '3']]);
  });
  it('maps LinkedIn-style columns, flags invalid rows and in-file duplicates', () => {
    const r = analyzeContactCsv(csv, []);
    expect(r.rows.map((x: any) => x.status)).toEqual(['NEW', 'NEW', 'INVALID', 'INVALID', 'DUPLICATE']);
    expect(r.rows[1].contact.name).toBe('Bob O"Brien, Jr');
    expect(r.rows[0].contact.channels).toEqual([{ type: 'email', value: 'jane@acme.com' }, { type: 'linkedin', value: 'https://www.linkedin.com/in/jane' }]);
    expect(r.unmappedColumns).toContain('Connected On');
  });
  it('treats spreadsheet formula text as plain text and strips control characters', () => {
    const r = analyzeContactCsv('name,notes\n"=HYPERLINK(""x"")\u0007",hi', []);
    expect(r.rows[0].contact.name).toBe('=HYPERLINK("x")');
  });
  it('requires consent, previews without writing, and commit skips duplicates of existing contacts', async () => {
    const { prisma, db } = fakePrisma(); const svc = new CrmService(prisma);
    await expect(svc.previewImport(u1, { csv, consent: false })).rejects.toThrow(/Confirm/);
    const p = await svc.previewImport(u1, { csv, consent: true });
    expect(p.summary).toEqual({ new: 2, duplicate: 1, invalid: 2 });
    expect(db.contacts).toHaveLength(0);
    await svc.createContact(u1, { name: 'Jane Doe', organization: 'Acme' });
    const done = await svc.commitImport(u1, { csv, consent: true });
    expect(done).toMatchObject({ created: 1, skippedDuplicates: 2, invalid: 2 });
    expect(db.contacts.map((c: any) => c.name).sort()).toEqual(['Bob O"Brien, Jr', 'Jane Doe']);
    expect(db.contacts.every((c: any) => c.userId === 'u1' && c.tenantId === 't1')).toBe(true);
    // a second user is isolated: nothing is a duplicate for them
    expect((await svc.previewImport(u2, { csv, consent: true })).summary.new).toBe(2);
  });
  it('caps rows', () => {
    const big = 'name\n' + Array.from({ length: 520 }, (_, i) => `P${i}`).join('\n');
    const r = analyzeContactCsv(big, []);
    expect(r.rows).toHaveLength(500); expect(r.truncated).toBe(true);
  });
});
