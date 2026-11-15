import { barWidth, dueLabel, formatRate, hasUnsupported, splitTags, unsupportedClaims, windowLabel, wordCount } from './career-tools.format';

describe('career-tools formatting', () => {
  it('formatRate always carries numerator and denominator', () => {
    expect(formatRate({ numerator: 2, denominator: 3, rate: 0.667 })).toBe('66.7% (2 of 3)');
    expect(formatRate({ numerator: 1, denominator: 2, rate: 0.5 })).toBe('50% (1 of 2)');
    expect(formatRate({ numerator: 0, denominator: 0, rate: null })).toBe('n/a (no applications)');
    expect(formatRate(null)).toBe('Not enough data');
  });
  it('windowLabel describes open and closed windows', () => {
    expect(windowLabel({ from: null, to: null })).toBe('All time');
    expect(windowLabel({ from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' })).toBe('2026-01-01 to 2026-02-01');
    expect(windowLabel({ from: '2026-01-01T00:00:00Z', to: null })).toBe('Since 2026-01-01');
  });
  it('barWidth scales and keeps non-zero bars visible', () => {
    expect(barWidth(5, 10)).toBe(50);
    expect(barWidth(1, 1000)).toBe(2);
    expect(barWidth(0, 10)).toBe(0);
    expect(barWidth(3, 0)).toBe(0);
  });
  it('detects unsupported claims per section', () => {
    const claims = [
      { sectionId: 'a', text: '40%', kind: 'metric', status: 'UNSUPPORTED' as const },
      { sectionId: 'b', text: 'Go', kind: 'skill', status: 'SUPPORTED' as const },
    ];
    expect(hasUnsupported(claims)).toBe(true);
    expect(unsupportedClaims(claims, 'b')).toEqual([]);
    expect(hasUnsupported([claims[1]])).toBe(false);
  });
  it('wordCount ignores blank sections', () => {
    expect(wordCount([{ id: 'a', heading: '', text: 'one two  three', origin: 'USER' }, { id: 'b', heading: '', text: '  ', origin: 'USER' }])).toBe(3);
  });
  it('dueLabel', () => {
    const now = new Date('2026-06-10T12:00:00');
    expect(dueLabel('2026-06-09T09:00:00', now)).toBe('overdue');
    expect(dueLabel('2026-06-10T18:00:00', now)).toBe('today');
    expect(dueLabel('2026-06-12T09:00:00', now)).toBe('upcoming');
  });
  it('splitTags trims, dedupes and caps', () => {
    expect(splitTags(' a, b ,a,, c ')).toEqual(['a', 'b', 'c']);
    expect(splitTags('')).toEqual([]);
  });
});
