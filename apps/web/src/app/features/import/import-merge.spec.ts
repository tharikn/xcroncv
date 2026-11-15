import { CareerProfile } from '../../core/models';
import { checkUpload, mergeIntoProfile, Picked } from './import-merge';

const none: Picked = { scalars: {}, links: [], experiences: [], skills: [], educations: [], projects: [], certifications: [], languages: [] };
const existing: CareerProfile = {
  fullName: 'Ada Lovelace', email: 'ada@example.com', summary: 'Mine.',
  experiences: [{ employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', isCurrent: true, bullets: [{ content: 'Old.', kind: 'ACHIEVEMENT', isUserConfirmed: true }] }],
  skills: [{ name: 'Maths' }], links: [], educations: [], projects: [], certifications: [], languages: [],
  // server-only fields must be stripped before PUT
  ...({ id: 'p1', userId: 'u1' } as object),
};

describe('mergeIntoProfile', () => {
  it('changes nothing when nothing is picked', () => {
    const r = mergeIntoProfile(existing, none);
    expect(r.added).toBe(0);
    expect(r.profile.fullName).toBe('Ada Lovelace');
    expect((r.profile as unknown as Record<string, unknown>)['id']).toBeUndefined();
    expect(r.profile.experiences).toHaveLength(1);
  });
  it('adds confirmed items, keeps existing ones, skips duplicates (case-insensitive)', () => {
    const r = mergeIntoProfile(existing, {
      ...none,
      experiences: [
        { employerName: 'BABBAGE & CO', jobTitle: 'programmer', startDate: '2020-01', isCurrent: true, bullets: [] },
        { employerName: 'US Navy', jobTitle: 'Admiral', startDate: '2010-03', endDate: '2015-06', isCurrent: false, bullets: [{ content: ' Led teams. ' }, { content: '  ' }] },
      ],
      skills: [{ name: 'maths' }, { name: 'COBOL', category: 'Languages' }],
    });
    expect(r.added).toBe(2);
    expect(r.profile.experiences!.map((e) => e.employerName)).toEqual(['Babbage & Co', 'US Navy']);
    expect(r.profile.experiences![1].bullets).toEqual([{ kind: 'RESPONSIBILITY', content: 'Led teams.', isUserConfirmed: true }]);
    expect(r.profile.skills!.map((s) => s.name)).toEqual(['Maths', 'COBOL']);
  });
  it('clears endDate for current roles', () => {
    const r = mergeIntoProfile(null, { ...none, scalars: { fullName: 'G H' }, experiences: [{ employerName: 'X', jobTitle: 'Y', startDate: '2020-01', endDate: '2021-01', isCurrent: true, bullets: [] }] });
    expect(r.profile.experiences![0].endDate).toBeUndefined();
  });
  it('overwrites a scalar only when picked and non-empty', () => {
    expect(mergeIntoProfile(existing, { ...none, scalars: { summary: 'New.' } }).profile.summary).toBe('New.');
    expect(mergeIntoProfile(existing, { ...none, scalars: { summary: '   ' } }).profile.summary).toBe('Mine.');
  });
  it('builds a new profile when none exists', () => {
    const r = mergeIntoProfile(null, { ...none, scalars: { fullName: 'Grace Hopper', email: 'g@example.com' } });
    expect(r.profile.fullName).toBe('Grace Hopper');
    expect(r.added).toBe(2);
  });
});

describe('checkUpload', () => {
  it('accepts pdf/docx within the limit', () => {
    expect(checkUpload({ name: 'CV.PDF', size: 1000 })).toBe('');
    expect(checkUpload({ name: 'cv.docx', size: 1000 })).toBe('');
  });
  it('rejects other types, empty and oversized files', () => {
    expect(checkUpload({ name: 'cv.doc', size: 10 })).toMatch(/PDF or DOCX/);
    expect(checkUpload({ name: 'cv.exe', size: 10 })).toMatch(/PDF or DOCX/);
    expect(checkUpload({ name: 'cv.pdf', size: 0 })).toMatch(/empty/);
    expect(checkUpload({ name: 'cv.pdf', size: 6 * 1024 * 1024 })).toMatch(/5 MB/);
  });
});
