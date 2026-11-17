import { RenderItem, RenderModel, RenderSection, SECTION_LABELS } from '../../core/models';
import { DocItem, DocSection, ResumeDoc } from '../../core/resume-doc';

/**
 * Converts a resume's render model into a visual-editor document and applies the
 * JD-tailored summary. The document is committed only when the user taps Generate,
 * keeping AI output suggestion-only until that explicit action.
 *
 * All other sections/items are copied verbatim so the candidate's confirmed
 * career facts, styling and section order survive the tailoring step.
 */
export function buildTailoredDoc(model: RenderModel, summary: string): ResumeDoc {
  const sections: DocSection[] = model.sections.map((section, index) => toDocSection(section, index, summary));

  // The render model omits empty sections; make sure the tailored summary is visible.
  if (!sections.some((s) => s.type === 'summary')) {
    sections.unshift({ id: 'summary', type: 'summary', title: SECTION_LABELS.summary, text: summary });
  }

  return {
    v: 1,
    header: {
      name: model.header.name,
      ...(model.header.headline ? { headline: model.header.headline } : {}),
      contacts: model.header.contacts.slice(0, 8),
      ...(model.header.photo ? { photo: model.header.photo } : {}),
    },
    sections,
    styles: model.styles ?? {},
  };
}

function toDocSection(section: RenderSection, index: number, summary: string): DocSection {
  const out: DocSection = { id: section.id || `s${index}`, type: section.type, title: section.title };
  if (section.type === 'summary') out.text = summary;
  else if (section.text !== undefined) out.text = section.text;
  if (section.items?.length) out.items = section.items.map((item, itemIndex) => toDocItem(item, index, itemIndex));
  return out;
}

function toDocItem(item: RenderItem, sectionIndex: number, itemIndex: number): DocItem {
  const out: DocItem = { id: item.id || `i${sectionIndex}_${itemIndex}` };
  if (item.title !== undefined) out.title = item.title;
  if (item.subtitle !== undefined) out.subtitle = item.subtitle;
  if (item.meta !== undefined) out.meta = item.meta;
  if (item.text !== undefined) out.text = item.text;
  if (item.bullets?.length) out.bullets = item.bullets;
  if (item.tags?.length) out.tags = item.tags;
  if (item.url !== undefined) out.url = item.url;
  if (item.image) out.image = item.image;
  return out;
}
