import { decodeClaims, isExpired, signDevToken, tokenFromFragment, b64urlDecodeToString, b64urlEncode } from './jwt';
import { emptyProfile, isBlankEducation, isYearMonth, moveItem, toProfileInput, validateProfile, validateProfileFull } from './profile-mapper';
import { safeFileName } from './file-name';
import { clamp, fitScale, overflowWarning, pageCount, PAGE_PX } from './preview-layout';
import { isValidApiUrl } from './url';
import { NATIVE_HANDOFF_REDIRECT, parseHandoffLink } from './native-handoff.logic';
import { branchesFor, COURSE_NAMES, OTHER_COURSE, withSavedOption } from './course-catalog';

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

  it('detects blank education rows and drops them from the API payload', () => {
    expect(isBlankEducation({ institution: '', degree: '', field: '', startDate: '', endDate: '', grade: '' })).toBe(true);
    expect(isBlankEducation({ institution: '  ', degree: '', field: null as any, startDate: null, endDate: undefined, grade: '' })).toBe(true);
    expect(isBlankEducation({ institution: 'MIT', degree: '', field: '', startDate: '', endDate: '' })).toBe(false);
    const out: any = toProfileInput({
      ...emptyProfile(), fullName: 'Ada',
      educations: [
        { institution: '', degree: '', field: '', startDate: '', endDate: '' },
        { institution: 'MIT', degree: 'B.Sc', field: 'Math', startDate: '2018-09', endDate: '2022-05' },
      ],
    });
    expect(out.educations).toEqual([{ institution: 'MIT', degree: 'B.Sc', field: 'Math', startDate: '2018-09', endDate: '2022-05', grade: undefined }]);
  });

  it('strictly validates every visible /profile field and ignores stray blank education rows', () => {
    const base = {
      ...emptyProfile(),
      fullName: 'Ada Lovelace',
      headline: 'Engineer',
      email: 'ada@example.com',
      phone: '+1 555 0100',
      location: 'London',
      summary: 'Pioneer of computing and analytical engines.',
    };
    const errs = validateProfileFull(base);
    expect(errs).toEqual([]);

    const missing = validateProfileFull({ ...emptyProfile(), fullName: '' });
    expect(missing).toEqual(expect.arrayContaining([
      'Full name is required.',
      'Headline is required.',
      'Email is required.',
      'Phone is required.',
      'Location is required.',
      'Summary is required.',
    ]));

    const short = validateProfileFull({ ...base, fullName: 'A', headline: 'Hi', summary: 'short' });
    expect(short).toContain('Full name must be at least 2 characters.');
    expect(short).toContain('Headline must be at least 3 characters.');
    expect(short).toContain('Summary must be at least 10 characters.');

    const badContacts = validateProfileFull({ ...base, email: 'nope', phone: 'abc' });
    expect(badContacts).toContain('Email address looks invalid.');
    expect(badContacts).toContain('Phone number looks invalid.');
  });

  it('strictly validates nested profile sections, dates, and conditional experience end dates', () => {
    const base = {
      ...emptyProfile(),
      fullName: 'Ada Lovelace',
      headline: 'Engineer',
      email: 'ada@example.com',
      phone: '+1 555 0100',
      location: 'London',
      summary: 'Pioneer of computing and analytical engines.',
    };

    const linkErrs = validateProfileFull({ ...base, links: [{ label: '', url: 'ftp://bad' }] });
    expect(linkErrs).toContain('Link 1: label is required.');
    expect(linkErrs).toContain('Link 1: URL must start with http:// or https://.');

    const expErrs = validateProfileFull({
      ...base,
      experiences: [{ employerName: '', jobTitle: '', location: '', startDate: '2020-13', isCurrent: false, endDate: '', bullets: [{ kind: 'RESPONSIBILITY', content: 'x' }] }],
    });
    expect(expErrs).toEqual(expect.arrayContaining([
      'Experience 1: employer is required.',
      'Experience 1: job title is required.',
      'Experience 1: location is required.',
      'Experience 1: start date must be YYYY-MM.',
      'Experience 1: end date is required (or mark the role as current).',
      'Experience 1: bullet 1 must be at least 3 characters.',
    ]));

    const currentOk = validateProfileFull({
      ...base,
      experiences: [{ employerName: 'Acme', jobTitle: 'Dev', location: 'NYC', startDate: '2021-01', isCurrent: true, bullets: [{ kind: 'RESPONSIBILITY', content: 'Built systems.' }] }],
    });
    expect(currentOk).toEqual([]);

    const dateOrder = validateProfileFull({
      ...base,
      experiences: [{ employerName: 'Acme', jobTitle: 'Dev', location: 'NYC', startDate: '2022-05', isCurrent: false, endDate: '2021-01', bullets: [{ kind: 'RESPONSIBILITY', content: 'Built systems.' }] }],
    });
    expect(dateOrder).toContain('Experience 1: end date is before start date.');

    const projErrs = validateProfileFull({ ...base, projects: [{ name: 'P', url: '', description: 'tiny', technologies: [] }] });
    expect(projErrs).toContain('Project 1: name must be at least 2 characters.');
    expect(projErrs).toContain('Project 1: URL is required.');
    expect(projErrs).toContain('Project 1: description must be at least 10 characters.');
    expect(projErrs).toContain('Project 1: add at least one technology.');
  });

  it('strictly validates education (course/branch) and ignores blank education rows', () => {
    const base = {
      ...emptyProfile(),
      fullName: 'Ada Lovelace',
      headline: 'Engineer',
      email: 'ada@example.com',
      phone: '+1 555 0100',
      location: 'London',
      summary: 'Pioneer of computing and analytical engines.',
    };

    const ignored = validateProfileFull({
      ...base,
      educations: [{ institution: '', degree: '', field: '', startDate: '', endDate: '' }],
    });
    expect(ignored).toEqual([]);

    const eduErrs = validateProfileFull({
      ...base,
      educations: [{ institution: 'M', degree: '', field: '', startDate: 'bad', endDate: '' }],
    });
    expect(eduErrs).toEqual(expect.arrayContaining([
      'Education 1: institution must be at least 2 characters.',
      'Education 1: course is required.',
      'Education 1: branch is required.',
      'Education 1: start date must be YYYY-MM.',
      'Education 1: end date is required.',
    ]));

    const eduOk = validateProfileFull({
      ...base,
      educations: [{ institution: 'MIT', degree: 'Bachelor of Science (B.Sc)', field: 'Mathematics', startDate: '2018-09', endDate: '2022-05' }],
    });
    expect(eduOk).toEqual([]);
  });
});

describe('course catalog', () => {
  it('exposes course names including the "other" fallback', () => {
    expect(COURSE_NAMES.length).toBeGreaterThan(0);
    expect(COURSE_NAMES).toContain(OTHER_COURSE);
    expect(COURSE_NAMES).toContain('Bachelor of Science (B.Sc)');
  });

  it('returns branches for known courses and none for unknown/legacy values', () => {
    expect(branchesFor('Bachelor of Science (B.Sc)')).toContain('Mathematics');
    expect(branchesFor('Unknown Course')).toEqual([]);
    expect(branchesFor(null)).toEqual([]);
    expect(branchesFor('')).toEqual([]);
  });

  it('preserves a saved value that is not in the catalog options', () => {
    const opts = ['General', 'Finance'];
    expect(withSavedOption(opts, 'Finance')).toEqual(opts);
    expect(withSavedOption(opts, 'Legacy Branch')).toEqual(['Legacy Branch', 'General', 'Finance']);
    expect(withSavedOption(opts, '')).toEqual(opts);
    expect(withSavedOption(opts, null)).toEqual(opts);
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

describe('native handoff deep link', () => {
  const code = 'a'.repeat(43);
  const nonce = '0123456789abcdef0123456789abcdef';
  const link = (extra = '') => `${NATIVE_HANDOFF_REDIRECT}?code=${code}&nonce=${nonce}${extra}`;

  it('accepts a well-formed cold/warm start link', () => {
    expect(parseHandoffLink(link())).toEqual({ code, nonce });
    expect(parseHandoffLink(link('&utm=x'))).toEqual({ code, nonce });
    expect(parseHandoffLink(`${NATIVE_HANDOFF_REDIRECT}/?code=${code}&nonce=${nonce}`)).toEqual({ code, nonce });
  });

  it('rejects the https callback, wrong host/path and other apps', () => {
    expect(parseHandoffLink(`https://xcroncv.example.com/auth/callback?code=${code}&nonce=${nonce}`)).toBeNull();
    expect(parseHandoffLink(`xcroncv://other/callback?code=${code}&nonce=${nonce}`)).toBeNull();
    expect(parseHandoffLink(`xcroncv://auth/reset?code=${code}&nonce=${nonce}`)).toBeNull();
    expect(parseHandoffLink(`intent://auth/callback?code=${code}&nonce=${nonce}`)).toBeNull();
    expect(parseHandoffLink('')).toBeNull();
    expect(parseHandoffLink(null)).toBeNull();
  });

  it('rejects a short/long code or a malformed nonce', () => {
    expect(parseHandoffLink(`${NATIVE_HANDOFF_REDIRECT}?code=short&nonce=${nonce}`)).toBeNull();
    expect(parseHandoffLink(`${NATIVE_HANDOFF_REDIRECT}?code=${'a'.repeat(101)}&nonce=${nonce}`)).toBeNull();
    expect(parseHandoffLink(`${NATIVE_HANDOFF_REDIRECT}?code=${code}`)).toBeNull();
    expect(parseHandoffLink(`${NATIVE_HANDOFF_REDIRECT}?code=${code}&nonce=short`)).toBeNull();
    expect(parseHandoffLink(`${NATIVE_HANDOFF_REDIRECT}?code=${code}&nonce=${'!'.repeat(32)}`)).toBeNull();
  });
});
