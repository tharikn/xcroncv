import { pageCount, planAutoBreaks, PAGE_PX } from './preview-layout';

describe('planAutoBreaks', () => {
  const pageH = PAGE_PX.A4.h; // 1123 css px @ 96dpi
  const marginPx = 54 * 4 / 3; // 54pt margin -> 72px (1pt = 4/3px)
  const verticalPadding = marginPx * 2; // top AND bottom sheet padding

  it('plans no break when the content fits on one page', () => {
    expect(planAutoBreaks([{ id: 's1', top: 120, height: 300 }], pageH, verticalPadding)).toEqual(new Set<string>());
  });

  it('auto-breaks before a section that crosses the printable content-area bottom', () => {
    expect(planAutoBreaks([{ id: 's1', top: 900, height: 300 }], pageH, verticalPadding).has('s1')).toBe(true);
  });

  it('enforces the bottom margin, not just the top margin', () => {
    // 900 + 150 = 1050 is inside pageH - topPadding (1051) but crosses pageH - top - bottom (979).
    expect(planAutoBreaks([{ id: 's1', top: 900, height: 150 }], pageH, verticalPadding).has('s1')).toBe(true);
  });

  it('keeps a section that ends inside the content area', () => {
    expect(planAutoBreaks([{ id: 's1', top: 900, height: 60 }], pageH, verticalPadding).size).toBe(0);
  });

  it('does not break a section that already starts a fresh page', () => {
    // A block that begins at a page boundary must not get a redundant second spacer.
    expect(planAutoBreaks([{ id: 's1', top: pageH + 10, height: 500 }], pageH, verticalPadding).size).toBe(0);
  });

  it('plans a break before each overflowing section and stops after the last', () => {
    const breaks = planAutoBreaks([
      { id: 's1', top: 120, height: 400 },
      { id: 's2', top: 520, height: 400 }, // ends at 920 -> fits
      { id: 's3', top: 920, height: 300 }, // ends at 1220 -> crosses the bottom, auto-breaks
      { id: 's4', top: pageH + 40, height: 200 }, // starts fresh on the new page, fits
    ], pageH, verticalPadding);
    expect([...breaks]).toEqual(['s3']);
  });

  it('reduces negative flow coordinates before deciding', () => {
    // Clipped page cards can report offsets relative to their own translated window.
    expect(planAutoBreaks([{ id: 's1', top: -pageH + 100, height: 1000 }], pageH, verticalPadding).has('s1')).toBe(true);
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
