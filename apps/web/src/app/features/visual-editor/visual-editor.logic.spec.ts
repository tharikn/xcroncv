import { RenderModel } from '../../core/models';
import { ResumeDoc } from '../../core/resume-doc';
import * as O from './doc.ops';
import { centeredCrop, clampCrop, coverScale, cropSource, pinchScale, wheelScale, zoomCrop } from './geometry';
import { History } from './history';
import { validateImageFile } from './image-process';

const t = (k: string) => k;
const model = (): RenderModel => ({
  schemaVersion: 1, template: { id: 'x', version: 1 }, page: { size: 'A4', marginPt: 54 },
  theme: { fontFamily: 'Helvetica', baseSizePt: 10.5, accent: '#223344', headingTransform: 'none', headerAlign: 'left', sectionRule: false },
  layout: 'single-column', sideSections: [],
  header: { name: 'Ada', headline: 'Eng', contacts: ['a@b.c', '123'], links: [] },
  sections: [
    { type: 'summary', title: 'Summary', text: 'Hi' },
    { type: 'experience', title: 'Experience', items: [{ title: 'Dev', subtitle: 'Acme', bullets: ['one', 'two'] }, { title: 'Ops', bullets: ['x'] }] },
    { type: 'skills', title: 'Skills', items: [{ title: 'Core', tags: ['Go', 'TS'] }] },
  ],
});
const doc = (): ResumeDoc => O.docFromModel(model());

describe('docFromModel / applyDoc', () => {
  it('assigns unique valid ids and round-trips through applyDoc', () => {
    const d = doc();
    const ids = [...d.sections.map((s) => s.id), ...d.sections.flatMap((s) => (s.items ?? []).map((i) => i.id))];
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[A-Za-z0-9_-]{1,40}$/));
    const m = O.applyDoc(model(), d);
    expect(m.sections.map((s) => s.title)).toEqual(['Summary', 'Experience', 'Skills']);
    expect(m.header.contacts).toEqual(['a@b.c', '123']);
  });
  it('keeps server-provided ids and de-duplicates', () => {
    const m = model(); m.sections[0].id = 'sa'; m.sections[1].id = 'sa';
    const d = O.docFromModel(m);
    expect(d.sections[0].id).toBe('sa');
    expect(d.sections[1].id).not.toBe('sa');
  });
  it('applyDoc omits hidden sections but the doc keeps them', () => {
    const base = doc();
    const d = O.toggleSectionHidden(base, base.sections[0].id);
    expect(d.sections).toHaveLength(3);
    expect(O.applyDoc(model(), d).sections).toHaveLength(2);
  });
});

describe('page breaks', () => {
  it('toggles pageBreakBefore without mutating and propagates it into the render model', () => {
    const d = doc(); const id = d.sections[1].id;
    expect(O.findSection(d, id)?.pageBreakBefore).toBeFalsy();
    const on = O.togglePageBreak(d, id);
    expect(JSON.stringify(d)).not.toContain('pageBreakBefore');
    expect(O.findSection(on, id)?.pageBreakBefore).toBe(true);
    expect(O.findSection(on, d.sections[0].id)?.pageBreakBefore).toBeFalsy();
    const m = O.applyDoc(model(), on);
    expect(m.sections.find((s) => s.id === id)?.pageBreakBefore).toBe(true);
    const off = O.togglePageBreak(on, id);
    expect(O.findSection(off, id)?.pageBreakBefore).toBeFalsy();
  });
});

describe('text editing', () => {
  it('edits header, contacts, section and item text without mutating the input', () => {
    const d = doc(); const snap = JSON.stringify(d);
    const s = d.sections[1]; const it = s.items![0];
    let n = O.setHeaderText(d, 'name', 'Ada L.');
    n = O.setHeaderText(n, 'headline', '');
    n = O.setContacts(n, 'x@y.z · 555 | Chennai');
    n = O.setSectionTitle(n, s.id, 'Work');
    n = O.setItemText(n, s.id, it.id, 'title', 'Lead');
    n = O.setBullet(n, s.id, it.id, 1, 'TWO');
    n = O.setTags(n, d.sections[2].id, d.sections[2].items![0].id, ' a, ,b ');
    expect(JSON.stringify(d)).toBe(snap);
    expect(n.header.name).toBe('Ada L.'); expect(n.header.headline).toBeUndefined();
    expect(n.header.contacts).toEqual(['x@y.z', '555', 'Chennai']);
    expect(n.sections[1].title).toBe('Work');
    expect(n.sections[1].items![0].title).toBe('Lead');
    expect(n.sections[1].items![0].bullets).toEqual(['one', 'TWO']);
    expect(n.sections[2].items![0].tags).toEqual(['a', 'b']);
  });
  it('inserts and removes bullets', () => {
    const d = doc(); const s = d.sections[1]; const it = s.items![0];
    const a = O.insertBullet(d, s.id, it.id, 0, 'mid');
    expect(a.sections[1].items![0].bullets).toEqual(['one', 'mid', 'two']);
    const b = O.removeBullet(O.removeBullet(a, s.id, it.id, 0), s.id, it.id, 0);
    expect(b.sections[1].items![0].bullets).toEqual(['two']);
    expect(O.removeBullet(b, s.id, it.id, 0).sections[1].items![0].bullets).toBeUndefined();
  });
});

describe('reorder', () => {
  it('moves sections up/down and stops at the ends', () => {
    const d = doc(); const [a, b, c] = d.sections.map((s) => s.id);
    expect(O.moveSection(d, b, -1).sections.map((s) => s.id)).toEqual([b, a, c]);
    expect(O.moveSection(d, b, 1).sections.map((s) => s.id)).toEqual([a, c, b]);
    expect(O.moveSection(d, a, -1)).toBe(d);
    expect(O.moveSection(d, c, 1)).toBe(d);
  });
  it('moves within a column group and skips the other column', () => {
    const d = doc(); const [a, b, c] = d.sections.map((s) => s.id);
    // skills is the side rail: experience (main) cannot swap with it, summary can
    expect(O.moveSection(d, b, 1, new Set(['skills']))).toBe(d);
    expect(O.moveSection(d, a, 1, new Set(['skills'])).sections.map((s) => s.id)).toEqual([b, a, c]);
  });
  it('moves items and supports drop-before', () => {
    const d = doc(); const s = d.sections[1]; const [i1, i2] = s.items!.map((i) => i.id);
    expect(O.moveItem(d, s.id, i1, 1).sections[1].items!.map((i) => i.id)).toEqual([i2, i1]);
    expect(O.moveItem(d, s.id, i1, -1)).toEqual(d);
    expect(O.moveItemBefore(d, s.id, i2, i1).sections[1].items!.map((i) => i.id)).toEqual([i2, i1]);
    expect(O.moveItemBefore(d, s.id, i1, null).sections[1].items!.map((i) => i.id)).toEqual([i2, i1]);
    expect(O.moveSectionBefore(d, d.sections[2].id, d.sections[0].id).sections.map((x) => x.title)).toEqual(['Skills', 'Summary', 'Experience']);
  });
  it('dropIndex / finalIndex / moveTo', () => {
    expect(O.dropIndex([10, 30, 50], 5)).toBe(0);
    expect(O.dropIndex([10, 30, 50], 35)).toBe(2);
    expect(O.dropIndex([10, 30, 50], 99)).toBe(3);
    expect(O.finalIndex(0, 2)).toBe(1); expect(O.finalIndex(2, 0)).toBe(0); expect(O.finalIndex(1, 1)).toBe(1);
    expect(O.moveTo([1, 2, 3], 0, 2)).toEqual([2, 3, 1]);
  });
});

describe('add / duplicate / remove', () => {
  it('adds typed sections after a given one and a custom section', () => {
    const d = doc();
    const a = O.addSection(d, 'education', 'Education', t, d.sections[0].id);
    expect(a.sections[1].type).toBe('education');
    expect(a.sections[1].items![0].title).toBe('ve.new.degree');
    const c = O.addSection(d, 'custom', 'Awards', t);
    expect(c.sections[3]).toMatchObject({ type: 'custom', title: 'Awards' });
    expect(c.sections[3].items).toHaveLength(1);
    expect(O.addSection(d, 'summary', 'S', t).sections[3].text).toBe('ve.new.summaryText');
  });
  it('caps the section count', () => {
    let d = doc();
    for (let i = 0; i < 30; i++) d = O.addSection(d, 'custom', 'x', t);
    expect(d.sections.length).toBe(20);
  });
  it('adds, duplicates and removes items (copies get new ids and styles)', () => {
    let d = doc(); const s = d.sections[1]; const i1 = s.items![0];
    d = O.setStyle(d, O.K.item(i1.id, 'title'), { bold: true });
    const added = O.addItem(d, s.id, t, i1.id);
    expect(added.doc.sections[1].items![1].id).toBe(added.id);
    const dup = O.duplicateItem(d, s.id, i1.id);
    expect(dup.doc.sections[1].items).toHaveLength(3);
    expect(dup.doc.sections[1].items![1].id).not.toBe(i1.id);
    expect(dup.doc.styles[O.K.item(dup.id!, 'title')]).toEqual({ bold: true });
    expect(O.removeItem(dup.doc, s.id, dup.id!).sections[1].items).toHaveLength(2);
  });
  it('duplicates a section with fresh ids and copied styles; remove prunes dead styles', () => {
    let d = doc(); const s = d.sections[1];
    d = O.setStyle(d, O.K.sec(s.id, 'title'), { italic: true });
    d = O.setStyle(d, O.K.item(s.items![0].id, 'title'), { sizePt: 14 });
    const dup = O.duplicateSection(d, s.id);
    const copy = dup.sections[2];
    expect(copy.id).not.toBe(s.id);
    expect(copy.items![0].id).not.toBe(s.items![0].id);
    expect(dup.styles[O.K.sec(copy.id, 'title')]).toEqual({ italic: true });
    expect(dup.styles[O.K.item(copy.items![0].id, 'title')]).toEqual({ sizePt: 14 });
    const removed = O.pruneStyles(O.removeSection(dup, copy.id));
    expect(Object.keys(removed.styles).sort()).toEqual([O.K.item(s.items![0].id, 'title'), O.K.sec(s.id, 'title')].sort());
  });
});

describe('styles', () => {
  it('merges patches, clamps, clears with null and drops empty styles', () => {
    let d = O.setStyle(doc(), 'header.name', { sizePt: 99, bold: true, color: 'accent' });
    expect(d.styles['header.name']).toEqual({ sizePt: 36, bold: true, color: 'accent' });
    d = O.setStyle(d, 'header.name', { sizePt: 2, spaceAfterPt: 100, bold: null });
    expect(d.styles['header.name']).toEqual({ sizePt: 6, color: 'accent', spaceAfterPt: 36 });
    d = O.resetStyle(d, 'header.name');
    expect(d.styles['header.name']).toBeUndefined();
  });
  it('cssFor resolves theme tokens against the accent', () => {
    const css = O.cssFor({ color: 'accent', bold: true, sizePt: 12, font: 'Courier', align: 'center', spaceAfterPt: 3 }, '#223344');
    expect(css).toMatchObject({ color: '#223344', 'font-weight': '700', 'font-size': '12pt', 'text-align': 'center', 'margin-bottom': '3pt' });
    expect(css['font-family']).toContain('Courier');
    expect(O.cssFor(undefined, '#000')).toEqual({});
    expect(O.resolveColor('ink', '#fff')).toBe('#111111');
    expect(O.resolveColor('bogus', '#fff')).toBeUndefined();
  });
  it('counts images', () => {
    let d = O.setPhoto(doc(), { src: 'data:image/png;base64,AA', sizePt: 60 });
    d = O.setItemImage(d, d.sections[1].id, d.sections[1].items![0].id, { src: 'data:image/png;base64,AA', sizePt: 24 });
    expect(O.countImages(d)).toBe(2);
    expect(O.countImages(O.setPhoto(d, undefined))).toBe(1);
  });
});

describe('History', () => {
  it('undo/redo and clears redo on new edit', () => {
    const h = new History<number>();
    h.record(1); h.record(2);
    expect(h.undo(3)).toBe(2); expect(h.undo(2)).toBe(1); expect(h.undo(1)).toBeUndefined();
    expect(h.redo(1)).toBe(2); expect(h.canRedo).toBe(true);
    h.record(2); expect(h.canRedo).toBe(false);
  });
  it('coalesces rapid edits with the same key inside the window only', () => {
    let now = 0; const h = new History<number>(100, 500, () => now);
    h.record(0, 'k'); now = 100; h.record(1, 'k'); now = 200; h.record(2, 'k');
    expect(h.undo(3)).toBe(0); expect(h.canUndo).toBe(false);
    h.clear(); now = 1000; h.record(0, 'k'); now = 2000; h.record(1, 'k');
    expect(h.undo(2)).toBe(1); expect(h.undo(1)).toBe(0);
  });
  it('limits depth', () => {
    const h = new History<number>(3);
    for (let i = 0; i < 10; i++) h.record(i);
    let n = 0; let cur = 10; for (let r = h.undo(cur); r !== undefined; r = h.undo(cur)) { cur = r; n++; }
    expect(n).toBe(3);
  });
});

describe('geometry', () => {
  it('pinch and wheel scale are clamped', () => {
    expect(pinchScale(1, 100, 200)).toBe(2);
    expect(pinchScale(1, 100, 1000)).toBe(2.5);
    expect(pinchScale(1, 100, 1)).toBe(0.25);
    expect(pinchScale(1, 0, 50)).toBe(1);
    expect(wheelScale(1, -100)).toBeGreaterThan(1);
    expect(wheelScale(1, 100)).toBeLessThan(1);
    expect(wheelScale(2.4, -5000)).toBe(2.5);
  });
  it('crop always covers the box and maps back to source pixels', () => {
    const w = 800, h = 400, box = 200;
    expect(coverScale(w, h, box)).toBe(0.5);
    const c = centeredCrop(w, h, box);
    expect(cropSource(c, w, h, box)).toEqual({ sx: 200, sy: 0, size: 400 });
    const far = clampCrop({ zoom: 1, ox: 500, oy: -500 }, w, h, box);
    expect(far.ox).toBe(0); expect(far.oy).toBe(0);
    const z = zoomCrop(c, 2, w, h, box);
    const src = cropSource(z, w, h, box);
    expect(src.size).toBe(200);
    expect(src.sx + src.size / 2).toBeCloseTo(400, 5); // zoom keeps the centre
    expect(src.sx).toBeGreaterThanOrEqual(0);
    expect(clampCrop({ zoom: 99, ox: 0, oy: 0 }, w, h, box).zoom).toBe(4);
  });
});

describe('image validation', () => {
  it('accepts raster images, refuses svg and oversize', () => {
    expect(validateImageFile({ type: 'image/png', size: 1000 })).toBe('ok');
    expect(validateImageFile({ type: 'image/jpeg', size: 1000 })).toBe('ok');
    expect(validateImageFile({ type: 'image/svg+xml', size: 10 })).toBe('type');
    expect(validateImageFile({ type: 'application/pdf', size: 10 })).toBe('type');
    expect(validateImageFile({ type: 'image/png', size: 9 * 1024 * 1024 })).toBe('size');
  });
});

describe('host Sections panel sync', () => {
  it('derives config from the document and reconciles host changes back', () => {
    const d = doc(); const [a, b] = d.sections;
    const moved = O.toggleSectionHidden(O.moveSection(d, b.id, -1), a.id);
    expect(O.cfgFromDoc(moved, [])).toEqual([{ type: 'experience', visible: true }, { type: 'summary', visible: false }, { type: 'skills', visible: true }]);
    const back = O.reconcileDoc(moved, [{ type: 'summary', visible: true }, { type: 'skills', visible: false }, { type: 'experience', visible: true }]);
    expect(back.sections.map((s) => s.type)).toEqual(['summary', 'skills', 'experience']);
    expect(back.sections.map((s) => !!s.hidden)).toEqual([false, true, false]);
    expect(O.reconcileDoc(back, O.cfgFromDoc(back, []))).toBe(back);
  });
  it('keeps custom sections in their slots', () => {
    let d = O.addSection(doc(), 'custom', 'Awards', t, doc().sections[0].id);
    d = { ...d, sections: [d.sections[1], ...d.sections.slice(0, 1), ...d.sections.slice(2)] };
    const r = O.reconcileDoc(d, [{ type: 'skills', visible: true }, { type: 'summary', visible: true }, { type: 'experience', visible: true }]);
    expect(r.sections.filter((s) => s.type === 'custom')).toHaveLength(1);
  });
});
