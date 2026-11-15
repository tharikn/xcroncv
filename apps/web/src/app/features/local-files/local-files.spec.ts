import { formatBytes, formatOf, nextVersionName, reconcile, safeSegment, validateRename } from './local-files';

describe('safeSegment', () => {
  it('removes separators, traversal and reserved characters', () => {
    expect(safeSegment('../../etc/passwd')).toBe('etcpasswd');
    expect(safeSegment('a/b\\c:d*e?f')).not.toMatch(/[\\/:*?]/);
    expect(safeSegment('  My   Resume  ')).toBe('My-Resume');
  });
  it('never returns empty or a Windows reserved device name', () => {
    expect(safeSegment('')).toBe('resume');
    expect(safeSegment('???')).toBe('resume');
    expect(safeSegment('CON')).toBe('resume');
    expect(safeSegment('com1')).toBe('resume');
  });
  it('bounds length and strips leading dots', () => {
    expect(safeSegment('x'.repeat(200)).length).toBeLessThanOrEqual(60);
    expect(safeSegment('...hidden')).toBe('hidden');
  });
});

describe('nextVersionName', () => {
  it('starts at v001', () => { expect(nextVersionName('My CV', 'pdf', [])).toBe('My-CV-v001.pdf'); });
  it('increments past the highest existing version of the same format only', () => {
    const existing = ['My-CV-v001.pdf', 'My-CV-v002.pdf', 'My-CV-v007.html', 'other-v009.pdf'];
    expect(nextVersionName('My CV', 'pdf', existing)).toBe('My-CV-v003.pdf');
    expect(nextVersionName('My CV', 'html', existing)).toBe('My-CV-v008.html');
  });
  it('is case-insensitive and never collides', () => {
    expect(nextVersionName('cv', 'pdf', ['CV-V001.PDF'])).toBe('cv-v002.pdf');
  });
  it('sanitises the extension', () => { expect(nextVersionName('cv', '../pdf', [])).toBe('cv-v001.pdf'); });
});

describe('validateRename', () => {
  const existing = ['a-v001.pdf', 'b-v001.pdf'];
  it('keeps the extension and accepts a unique name', () => {
    expect(validateRename('a-v001.pdf', 'Final CV', existing)).toEqual({ ok: true, name: 'Final-CV.pdf' });
    expect(validateRename('a-v001.pdf', 'Final CV.pdf', existing)).toEqual({ ok: true, name: 'Final-CV.pdf' });
  });
  it('rejects empty, unusable and colliding names', () => {
    expect(validateRename('a-v001.pdf', '  ', existing).ok).toBe(false);
    expect(validateRename('a-v001.pdf', '***', existing).ok).toBe(false);
    const r = validateRename('a-v001.pdf', 'B-V001', existing);
    expect(r.ok).toBe(false);
  });
  it('treats an unchanged name as a no-op', () => { expect(validateRename('a-v001.pdf', 'a-v001', existing)).toEqual({ ok: true, name: 'a-v001.pdf' }); });
});

describe('reconcile', () => {
  it('marks indexed files missing from disk as unavailable and sorts newest first', () => {
    const out = reconcile(
      [{ folder: 'cv', name: 'cv-v001.pdf', format: 'pdf', size: 10, modified: 100 }],
      [{ folder: 'cv', name: 'cv-v001.pdf', format: 'pdf', size: 10, savedAt: 100 }, { folder: 'cv', name: 'gone.pdf', format: 'pdf', size: 5, savedAt: 200 }],
    );
    expect(out.map((f) => [f.name, f.available])).toEqual([['gone.pdf', false], ['cv-v001.pdf', true]]);
  });
  it('lists files that are on disk but not in the index', () => {
    expect(reconcile([{ folder: 'x', name: 'y.pdf', format: 'pdf', size: 1, modified: 1 }], []).length).toBe(1);
  });
});

describe('misc', () => {
  it('formats bytes', () => { expect(formatBytes(512)).toBe('512 B'); expect(formatBytes(2048)).toBe('2.0 KB'); expect(formatBytes(-1)).toBe('-'); });
  it('derives the format', () => { expect(formatOf('a.PDF')).toBe('pdf'); expect(formatOf('noext')).toBe(''); });
});
