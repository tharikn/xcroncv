import { proposeDesignPatch } from './design-patch';
import { setActiveLocale } from './i18n/translate';
import { ResumeDoc } from './resume-doc';

const doc = (): ResumeDoc => ({
  v: 1,
  header: { name: 'Ada', contacts: ['ada@example.com'] },
  sections: [
    { id: 's1', type: 'custom', title: 'Experience', text: 'Summary', items: [{ id: 'i1', title: 'Dev', bullets: ['Built x'] }] },
    { id: 's2', type: 'education', title: 'Education', items: [] },
  ],
  styles: {},
});

describe('proposeDesignPatch', () => {
  beforeEach(() => setActiveLocale('en'));

  it('builds a bounded fit-on-page patch from the deterministic command', () => {
    const patch = proposeDesignPatch('Fit my design on the page by tightening spacing and text size', doc())!;
    expect(patch.ops).toHaveLength(2);
    expect(patch.ops[0]).toMatchObject({ kind: 'style', labelKey: 've.chatPatch.fitTitles', patch: { spaceAfterPt: 0 } });
    expect((patch.ops[1] as { keys: string[] }).keys).toEqual(expect.arrayContaining(['i.i1.title', 's.s1.text']));
  });

  it('resolves a forced page break by section title', () => {
    const patch = proposeDesignPatch('Start Education on a new page', doc())!;
    expect(patch.ops).toEqual([{ kind: 'pageBreak', sectionId: 's2', value: true, labelKey: 've.chatPatch.pageBreak', labelParams: { section: 'Education' } }]);
  });

  it('never proposes a patch for unrelated chat', () => {
    expect(proposeDesignPatch('What makes a resume ATS friendly?', doc())).toBeNull();
  });

  it('proposes nothing when the editor has no document', () => {
    expect(proposeDesignPatch('Center my header', null)).toBeNull();
  });
});
