import { backAction } from './back-action';
import { LoadingCounter, SHOW_DELAY_MS, isSilentUrl } from './api-loading-counter';
import { errorMessage } from './error-message';
import { resolveTheme, isTheme } from './theme';
import { translate } from './i18n/translate';

describe('resolveTheme', () => {
  it('follows the OS only for "system"', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
  it('validates stored values', () => {
    expect(isTheme('warm')).toBe(false);
    expect(isTheme('dark')).toBe(true);
  });
});

describe('LoadingCounter', () => {
  const mk = () => { const l: any = new LoadingCounter((v) => (l.visible = v)); l.visible = false; const w = { begin: () => l.begin(), end: () => l.end(), visible: () => l.visible }; return w; };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('stays hidden for fast requests (no flicker)', () => {
    const l = mk();
    l.begin(); jest.advanceTimersByTime(SHOW_DELAY_MS - 10); l.end();
    jest.advanceTimersByTime(SHOW_DELAY_MS * 2);
    expect(l.visible()).toBe(false);
  });
  it('shows after the delay and hides only when every request finished', () => {
    const l = mk();
    l.begin(); l.begin();
    jest.advanceTimersByTime(SHOW_DELAY_MS + 1);
    expect(l.visible()).toBe(true);
    l.end(); expect(l.visible()).toBe(true);
    l.end(); expect(l.visible()).toBe(false);
  });
  it('never goes negative on an unbalanced end()', () => {
    const l = mk();
    l.end(); l.begin(); jest.advanceTimersByTime(SHOW_DELAY_MS + 1);
    expect(l.visible()).toBe(true);
  });
  it('ignores background preference calls', () => {
    expect(isSilentUrl('http://x/api/v1/me/preferences')).toBe(true);
    expect(isSilentUrl('http://x/api/v1/resumes')).toBe(false);
  });
});

describe('errorMessage', () => {
  const http = (status: number, error?: unknown) => ({ status, error: error ?? null });
  it('maps network, auth, throttle statuses to friendly copy', () => {
    expect(errorMessage(http(0))).toBe(translate('en', 'err.network'));
    expect(errorMessage(http(401, { message: 'jwt expired' }))).toBe(translate('en', 'err.unauthorized'));
    expect(errorMessage(http(403))).toBe(translate('en', 'err.forbidden'));
    expect(errorMessage(http(429))).toBe(translate('en', 'err.rateLimited'));
  });
  it('keeps a server validation message, joins arrays', () => {
    expect(errorMessage(http(400, { message: ['a is required', 'b is invalid'] }))).toBe('a is required; b is invalid');
    expect(errorMessage(http(500, { message: 'Injected failure' }))).toBe('Injected failure');
  });
  it('falls back to generic copy when the server gave no message', () => {
    expect(errorMessage(http(500))).toBe(translate('en', 'err.server'));
    expect(errorMessage(http(404))).toBe(translate('en', 'err.generic'));
    expect(errorMessage({})).toBe(translate('en', 'err.generic'));
    expect(errorMessage(new Error('boom'))).toBe('boom');
  });
});

describe('backAction', () => {
  it('exits on root screens', () => {
    expect(backAction('/dashboard', 5)).toBe('exit');
    expect(backAction('/dashboard?x=1', 5)).toBe('exit');
    expect(backAction('/', 1)).toBe('exit');
    expect(backAction('/login', 3)).toBe('exit');
  });
  it('steps back when there is history, else goes home', () => {
    expect(backAction('/resumes/abc', 4)).toBe('back');
    expect(backAction('/resumes/abc', 1)).toBe('home');
  });
});
