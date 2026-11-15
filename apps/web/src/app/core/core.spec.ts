import { decodeClaims, isExpired, signDevToken, tokenFromFragment, b64urlDecodeToString, b64urlEncode } from './jwt';
import { emptyProfile, isYearMonth, moveItem, toProfileInput, validateProfile } from './profile-mapper';
import { safeFileName } from './file-name';
import { clamp, fitScale, overflowWarning, pageCount, PAGE_PX } from './preview-layout';
import { isValidApiUrl } from './url';

describe('jwt helpers', () => {
  it('round-trips base64url incl. unicode', () => {
    const s = 'héllo wörld ✓';
    expect(b64urlDecodeToString(b64urlEncode(new TextEncoder().encode(s)))).toBe(s);
  });

  it('signs a dev token whose claims decode and are not expired', async () => {
    const t = await signDevToken({ secret: 's'.repeat(32), sub: 'u1', tenant: 't1', iss: 'iss', aud: 'aud' });
    const c = decodeClaims(t)!;
    expect(c.sub).toBe('u1');
    expect(c.tenant_id).toBe('t1');
    expect(isExpired(c)).toBe(false);
  });

  it('treats missing/old exp and garbage as expired/invalid', () => {
    expect(isExpired(null)).toBe(true);
    expect(isExpired({ exp: 1 })).toBe(true);
    expect(decodeClaims('not-a-jwt')).toBeNull();
    expect(decodeClaims('a.b.c')).toBeNull();
  });

  it('applies clock skew to expiry', () => {
    const now = 1_000_000_000_000;
    expect(isExpired({ exp: now / 1000 + 10 }, now, 15)).toBe(true);
    expect(isExpired({ exp: now / 1000 + 60 }, now, 15)).toBe(false);
  });

  it('extracts a handoff token from the URL fragment only', () => {
    expect(tokenFromFragment('#access_token=abc.def.ghi&x=1')).toBe('abc.def.ghi');
    expect(tokenFromFragment('#state=1&access_token=zzz')).toBe('zzz');
    expect(tokenFromFragment('#nothing')).toBeNull();
    expect(tokenFromFragment('')).toBeNull();
  });
});

describe('profile mapper', () => {
  it('strips server fields and null/empty values so the API accepts the payload', () => {
    const server: any = {
      id: 'p1', userId: 'u', tenantId: 't', fullName: ' Ada ', email: null, phone: '', headline: 'Eng',
      experiences: [{ id: 'e', profileId: 'p1', displayOrder: 0, employerName: 'Acme', jobTitle: 'Dev', startDate: '2020-01',
        endDate: '2021-01', isCurrent: true, bullets: [{ id: 'b', experienceId: 'e', displayOrder: 0, content: ' Did x ', kind: 'ACHIEVEMENT' }, { content: '  ' }] }],
      skills: [{ id: 's', profileId: 'p1', name: 'TS', category: null }, { name: ' ' }],
    };
    const out: any = toProfileInput(server);
    expect(out.id).toBeUndefined();
    expect(out.fullName).toBe('Ada');
    expect(out.email).toBeUndefined();
    expect(out.phone).toBeUndefined();
    expect(out.experiences[0].id).toBeUndefined();
    expect(out.experiences[0].endDate).toBeUndefined(); // current job drops end date
    expect(out.experiences[0].bullets).toEqual([{ kind: 'ACHIEVEMENT', content: 'Did x', isUserConfirmed: true }]);
    expect(out.skills).toEqual([{ name: 'TS', category: undefined, proficiency: undefined, yearsUsed: undefined }]);
  });

  it('validates required fields, dates and URLs', () => {
    const p = emptyProfile();
    expect(validateProfile(p)).toContain('Full name is required.');
    p.fullName = 'Ada';
    p.email = 'nope';
    p.links = [{ label: 'x', url: 'javascript:alert(1)' }];
    p.experiences = [{ employerName: 'A', jobTitle: 'B', startDate: '2020-13' }];
    const errs = validateProfile(p);
    expect(errs.some((e) => e.includes('Email'))).toBe(true);
    expect(errs.some((e) => e.includes('Link 1'))).toBe(true);
    expect(errs.some((e) => e.includes('start date'))).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    const p = { ...emptyProfile(), fullName: 'A', experiences: [{ employerName: 'A', jobTitle: 'B', startDate: '2022-05', endDate: '2021-01' }] };
    expect(validateProfile(p).some((e) => e.includes('before start'))).toBe(true);
  });

  it('accepts a valid profile', () => {
    const p = { ...emptyProfile(), fullName: 'Ada', email: 'ada@example.com', links: [{ label: 'Site', url: 'https://ada.dev' }],
      experiences: [{ employerName: 'A', jobTitle: 'B', startDate: '2020-01', isCurrent: true }] };
    expect(validateProfile(p)).toEqual([]);
  });

  it('validates year-month', () => {
    expect(isYearMonth('2020-01')).toBe(true);
    expect(isYearMonth('2020-1')).toBe(false);
    expect(isYearMonth('')).toBe(true);
  });

  it('moveItem returns a new array and ignores out-of-range moves', () => {
    const a = [1, 2, 3];
    expect(moveItem(a, 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem(a, 0, -1)).toBe(a);
    expect(moveItem(a, 2, 3)).toBe(a);
    expect(a).toEqual([1, 2, 3]);
  });
});

describe('safeFileName', () => {
  it('removes path separators and unsafe chars', () => {
    expect(safeFileName('../../etc/passwd', 'pdf')).toBe('etcpasswd.pdf');
    expect(safeFileName('Ada <Lovelace> "CV"', 'html')).toBe('Ada-Lovelace-CV.html');
  });
  it('falls back for empty names and bounds length', () => {
    expect(safeFileName('???', 'pdf')).toBe('resume.pdf');
    expect(safeFileName('a'.repeat(300), 'pdf').length).toBeLessThanOrEqual(84);
  });
});

describe('preview layout', () => {
  it('counts pages from content height', () => {
    expect(pageCount(100, 'A4')).toBe(1);
    expect(pageCount(PAGE_PX.A4.h, 'A4')).toBe(1);
    expect(pageCount(PAGE_PX.A4.h + 1, 'A4')).toBe(2);
    expect(pageCount(PAGE_PX.LETTER.h * 2 + 5, 'LETTER')).toBe(3);
  });
  it('computes fit scales and clamps', () => {
    const w = fitScale('width', 'A4', { w: 432, h: 900 });
    expect(w).toBeCloseTo((432 - 32) / 794, 3);
    expect(fitScale('page', 'A4', { w: 2000, h: 600 })).toBeCloseTo((600 - 32) / 1123, 3);
    expect(fitScale('manual', 'A4', { w: 1, h: 1 }, 9)).toBe(2);
    expect(clamp(0, 0.25, 2)).toBe(0.25);
  });
  it('warns only beyond two pages', () => {
    expect(overflowWarning(2)).toBeNull();
    expect(overflowWarning(3)).toContain('3 pages');
  });
});

describe('isValidApiUrl', () => {
  it('accepts http(s) and root-relative, rejects others', () => {
    expect(isValidApiUrl('http://10.0.2.2:3100/api/v1')).toBe(true);
    expect(isValidApiUrl('/api/v1')).toBe(true);
    expect(isValidApiUrl('javascript:alert(1)')).toBe(false);
    expect(isValidApiUrl('nonsense')).toBe(false);
    expect(isValidApiUrl('//evil.com')).toBe(false);
  });
});
