import { pageCount, planAutoBreaks, PAGE_PX } from './preview-layout';

describe('planAutoBreaks', () => {
  const pageH = PAGE_PX.A4.h; // 1123 css px @ 96dpi
  const topPad = 54 * 4 / 3; // 54pt margin -> 72px (1pt = 4/3px); sheet padding is authored in pt

  it('plans no break when the content fits on one page', () => {
    expect(planAutoBreaks([{ id: 's1', top: 120, height: 300 }], pageH, topPad)).toEqual(new Set<string>());
  });

  it('auto-breaks before a section that crosses the printable content-area bottom', () => {
    expect(planAutoBreaks([{ id: 's1', top: 900, height: 300 }], pageH, topPad).has('s1')).toBe(true);
  });

  it('keeps a section that ends inside the content area', () => {
    expect(planAutoBreaks([{ id: 's1', top: 900, height: 150 }], pageH, topPad).size).toBe(0);
  });

  it('does not break the first section of a fresh page', () => {
    expect(planAutoBreaks([{ id: 's1', top: topPad, height: 500 }], pageH, topPad).size).toBe(0);
  });

  it('plans a break before each overflowing section and stops after the last', () => {
    const breaks = planAutoBreaks([
      { id: 's1', top: 120, height: 400 },
      { id: 's2', top: 520, height: 400 }, // ends at 920 -> fits
      { id: 's3', top: 920, height: 300 }, // ends at 1220 -> crosses the bottom, auto-breaks
      { id: 's4', top: topPad + 40, height: 200 }, // starts fresh on the new page, fits
    ], pageH, topPad);
    expect([...breaks]).toEqual(['s3']);
  });
});

describe('pageCount', () => {
  it('computes pages from the content height', () => {
    expect(pageCount(0, 'A4')).toBe(1);
    expect(pageCount(PAGE_PX.A4.h - 1, 'A4')).toBe(1);
    expect(pageCount(PAGE_PX.A4.h + 1, 'A4')).toBe(2);
    expect(pageCount(5000, 'LETTER')).toBe(5);
  });
});
