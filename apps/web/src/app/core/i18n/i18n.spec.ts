import { EN } from './en';
import { HI } from './hi';
import { TA } from './ta';
import { detectLocale, interpolate, translate } from './translate';

const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

describe('catalogs', () => {
  for (const [name, cat] of [['ta', TA], ['hi', HI]] as const) {
    it(`${name} has exactly the English keys`, () => {
      expect(Object.keys(cat).sort()).toEqual(Object.keys(EN).sort());
    });
    it(`${name} keeps the same {placeholders} as English and no empty strings`, () => {
      for (const k of Object.keys(EN) as (keyof typeof EN)[]) {
        expect((cat as Record<string, string>)[k].trim()).not.toBe('');
        expect(params((cat as Record<string, string>)[k])).toBe(params(EN[k]));
      }
    });
  }
});

describe('translate', () => {
  it('uses the active catalog and interpolates', () => {
    expect(translate('en', 'dash.welcomeName', { name: 'Ada' })).toBe('Welcome, Ada');
    expect(translate('hi', 'nav.home')).toBe('होम');
    expect(translate('ta', 'settings.apiConnected', { n: 3 })).toContain('3');
  });
  it('falls back to the key for unknown keys and leaves unknown placeholders visible', () => {
    expect(translate('ta', 'no.such.key')).toBe('no.such.key');
    expect(interpolate('Hi {x}', {})).toBe('Hi {x}');
  });
});

describe('detectLocale', () => {
  it('maps regional tags and falls back to English', () => {
    expect(detectLocale(['ta-IN', 'en'])).toBe('ta');
    expect(detectLocale(['fr-FR', 'hi'])).toBe('hi');
    expect(detectLocale(['fr'])).toBe('en');
    expect(detectLocale([])).toBe('en');
  });
});
