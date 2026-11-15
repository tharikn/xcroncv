import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CareerDocumentsService } from '../src/career-documents/career-documents.service';
import { buildDraft, diffSections, DOC_TYPES, placeholdersIn, renderText, validateClaims } from '../src/career-documents/doc-logic';

const profile: any = {
  fullName: 'Ada Lovelace', headline: 'Programmer',
  experiences: [{ id: 'e1', jobTitle: 'Programmer', employerName: 'Babbage & Co', isCurrent: true, startDate: '2020-01', bullets: [
    { id: 'b1', kind: 'ACHIEVEMENT', content: 'Wrote the first published algorithm.' }, { id: 'b2', kind: 'RESPONSIBILITY', content: 'Maintained the engine notation.' }, { id: 'b3', kind: 'ACHIEVEMENT', content: 'Unconfirmed claim', isUserConfirmed: false }] }],
  skills: [{ id: 's1', name: 'Mathematics' }, { id: 's2', name: 'Algorithms' }, { id: 's3', name: 'Hidden', isUserConfirmed: false }],
  projects: [{ id: 'p1', name: 'Notes on the Engine', description: 'Annotated translation.', technologies: ['Mathematics'] }],
};

describe('drafts', () => {
  it('builds every document type with evidence links or visible placeholders, never invented content', () => {
    for (const t of DOC_TYPES) {
      const d = buildDraft(t, profile, {});
      expect(d.sections.length).toBeGreaterThan(0);
      for (const c of d.claims.filter((x) => x.label === 'EVIDENCED')) expect(c.evidence).toBeTruthy();
      for (const s of d.sections.filter((x) => x.origin === 'USER')) expect(s.text).toMatch(/\[add [^\]]+\]/);
    }
  });
  it('bio uses confirmed facts only', () => {
    const d = buildDraft('BIO', profile, {});
    expect(d.sections[0].text).toBe('Ada Lovelace is a Programmer at Babbage & Co.');
    expect(JSON.stringify(d)).not.toContain('Hidden');
    expect(d.claims.find((c) => c.text === 'Mathematics')?.evidence).toMatchObject({ type: 'skill', id: 's1' });
  });
  it('promotion case lists only confirmed achievements with bullet evidence', () => {
    const d = buildDraft('PROMOTION_CASE', profile, { targetRole: 'Lead' });
    expect(d.sections.map((s) => s.text).join(' ')).toContain('Wrote the first published algorithm.');
    expect(JSON.stringify(d)).not.toContain('Unconfirmed');
    expect(d.claims.find((c) => c.evidence?.type === 'bullet')?.evidence?.id).toBe('b1');
  });
  it('inputs fill placeholders, tone changes wording, resignation carries a neutral disclaimer elsewhere', () => {
    const f = buildDraft('RESIGNATION', profile, { managerName: 'Charles', lastDay: '2026-09-30' }, 'friendly');
    expect(f.sections[0].text).toBe('Hi Charles,');
    expect(f.sections[1].text).toContain('2026-09-30');
    expect(placeholdersIn(f.sections)).toEqual([]);
    expect(placeholdersIn(buildDraft('THANK_YOU', profile, {}).sections).length).toBeGreaterThan(0);
  });
});

describe('validation, diff, export', () => {
  it('flags stale evidence (items removed by a profile save) and unfilled placeholders', () => {
    const d = buildDraft('BIO', profile, {});
    expect(validateClaims(profile, d.claims, d.sections).stale).toEqual([]);
    const gone = { ...profile, skills: [], experiences: [] };
    const v = validateClaims(gone, d.claims, d.sections);
    expect(v.stale.length).toBeGreaterThan(0);
    expect(v.ok).toBe(false);
    expect(v.placeholders.length).toBeGreaterThan(0);
  });
  it('diffs sections', () => {
    const a = [{ id: 'x', heading: 'X', text: 'one', origin: 'PROFILE' as const }, { id: 'y', heading: 'Y', text: 'same', origin: 'PROFILE' as const }];
    const b = [{ id: 'x', heading: 'X', text: 'two', origin: 'USER' as const }, { id: 'y', heading: 'Y', text: 'same', origin: 'PROFILE' as const }, { id: 'z', heading: 'Z', text: 'new', origin: 'USER' as const }];
    expect(diffSections(a, b).map((d) => d.status)).toEqual(['CHANGED', 'UNCHANGED', 'ADDED']);
  });
  it('renders txt and md', () => {
    const s = [{ id: 'x', heading: 'Intro', text: 'Hello', origin: 'PROFILE' as const }];
    expect(renderText('T', s, 'txt')).toBe('Hello\n');
    expect(renderText('T', s, 'md')).toBe('# T\n\n## Intro\n\nHello\n');
  });
});

describe('CareerDocumentsService', () => {
  const user = { userId: 'u1', tenantId: 't1', issuer: 'i', subject: 's' };
  const NOW = new Date();
  const base = buildDraft('BIO', profile, {});
  const doc = (o: any = {}) => ({ id: 'd1', tenantId: 't1', userId: 'u1', type: 'BIO', title: 'My bio', currentVersion: 1, createdAt: NOW, updatedAt: NOW,
    versions: [{ versionNumber: 1, sections: base.sections, claims: base.claims, changeSummary: null, createdAt: NOW }], ...o });
  const mk = (over: any = {}) => {
    const prisma: any = {
      careerDocument: {
        findFirst: jest.fn().mockResolvedValue(over.doc === undefined ? doc() : over.doc), count: jest.fn().mockResolvedValue(over.count ?? 0),
        create: jest.fn().mockImplementation(async (a: any) => doc({ ...a.data, versions: a.data.versions.create })), findMany: jest.fn().mockResolvedValue([]), update: jest.fn(), delete: jest.fn(),
      },
      careerDocumentVersion: { create: jest.fn().mockResolvedValue({}) },
    };
    return { svc: new CareerDocumentsService(prisma, { get: jest.fn().mockResolvedValue(profile) } as any), prisma };
  };

  it('creates a first version from the profile with the owner from the token', async () => {
    const { svc, prisma } = mk();
    const r: any = await svc.create(user, { type: 'BIO' });
    expect(prisma.careerDocument.create.mock.calls[0][0].data).toMatchObject({ tenantId: 't1', userId: 'u1', type: 'BIO' });
    expect(r.version.sections[0].text).toContain('Ada Lovelace');
    await expect(mk({ count: 100 }).svc.create(user, { type: 'BIO' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('versions are immutable: an edit makes a new version, edited sections become user-authored and lose evidence links', async () => {
    const { svc, prisma } = mk();
    await svc.createVersion(user, 'd1', { sections: [{ id: 'intro', text: 'Ada is a mathematician.' }] });
    const data = prisma.careerDocumentVersion.create.mock.calls[0][0].data;
    expect(data.versionNumber).toBe(2);
    expect(data.sections.find((s: any) => s.id === 'intro')).toMatchObject({ origin: 'USER', text: 'Ada is a mathematician.' });
    expect(data.claims.filter((c: any) => c.sectionId === 'intro')).toEqual([expect.objectContaining({ label: 'USER_AUTHORED', evidence: null })]);
    expect(data.claims.filter((c: any) => c.sectionId === 'skills').every((c: any) => c.label === 'EVIDENCED')).toBe(true);
    expect(prisma.careerDocument.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { currentVersion: 2 } });
    await expect(svc.createVersion(user, 'd1', { sections: [{ id: 'nope', text: 'x' }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.createVersion(user, 'd1', { sections: [{ id: 'intro', text: base.sections[0].text }] })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('filters by tenant AND owner', async () => {
    const { svc, prisma } = mk({ doc: null });
    await expect(svc.get(user, 'x')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.careerDocument.findFirst.mock.calls[0][0].where).toEqual({ id: 'x', tenantId: 't1', userId: 'u1' });
    await expect(svc.export(user, 'x', 'txt')).rejects.toBeInstanceOf(NotFoundException);
  });
  it('exports as a sanitised attachment name and stores nothing', async () => {
    const { svc, prisma } = mk({ doc: doc({ title: '../../My <bio>' }) });
    const f = await svc.export(user, 'd1', 'md');
    expect(f.filename).toBe('My-bio-v1.md');
    expect(f.body).toContain('Ada Lovelace');
    expect(prisma.careerDocumentVersion.create).not.toHaveBeenCalled();
  });
  it('the service exports docx and pdf with attachment names and stores nothing', async () => {
    const { svc, prisma } = mk({ doc: doc({ title: 'My bio' }) });
    const d = await svc.export(user, 'd1', 'docx');
    expect(d.filename).toBe('My-bio-v1.docx');
    expect(d.contentType).toContain('wordprocessingml');
    const p = await svc.export(user, 'd1', 'pdf');
    expect(p.filename).toBe('My-bio-v1.pdf');
    expect(Buffer.from(p.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect(prisma.careerDocumentVersion.create).not.toHaveBeenCalled();
  });
  it('lists types with the resignation disclaimer', () => {
    const t: any[] = mk().svc.types();
    expect(t.find((x) => x.id === 'RESIGNATION').disclaimer).toMatch(/not legal/);
    expect(t).toHaveLength(7);
  });
});

describe('DOCX and PDF export', () => {
  const { extractDocx, extractPdf } = require('../src/import-export/text-extract');
  const { renderDocDocx, renderDocPdf } = require('../src/career-documents/doc-export');
  const sections = [
    { id: 'intro', heading: 'Introduction', text: 'Ada Lovelace is a mathematician & <engineer>.\nSecond line.', origin: 'PROFILE' },
    { id: 'skills', heading: 'Skills', text: 'Analysis, "Algorithms"', origin: 'USER' },
  ];
  it('DOCX is a valid package whose text round-trips through the module-06 extractor, with escaping', () => {
    const buf = renderDocDocx('Bio <x> & y', sections);
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    const lines: string[] = extractDocx(buf).lines;
    expect(lines).toEqual(expect.arrayContaining(['Bio <x> & y', 'Introduction', 'Ada Lovelace is a mathematician & <engineer>.', 'Second line.', 'Skills']));
  });
  it('PDF is a real PDF with selectable text', async () => {
    const buf: Buffer = await renderDocPdf('Bio', sections);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    const text = (await extractPdf(buf)).lines.join(' ');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Skills');
  });
});
