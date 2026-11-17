import { SectionType, TemplateVersionPackage } from '../templates/template.types';
import { sanitizeDoc, ResumeDoc } from './resume-doc';
import { RenderItem, RenderModel, RenderSection } from './render-model.types';

/** Minimal structural input so the builder stays pure and unit-testable (Prisma payloads satisfy it). */
export interface ProfileInput {
  fullName: string; email?: string | null; phone?: string | null; location?: string | null;
  links?: unknown; headline?: string | null; summary?: string | null;
  experiences: Array<{
    employerName: string; jobTitle: string; location?: string | null; startDate: string;
    endDate?: string | null; isCurrent: boolean; description?: string | null;
    bullets: Array<{ content: string }>;
  }>;
  skills: Array<{ name: string; category?: string | null }>;
  educations: Array<{
    institution: string; degree: string; field?: string | null; startDate?: string | null;
    endDate?: string | null; grade?: string | null;
  }>;
  projects: Array<{ name: string; url?: string | null; description?: string | null; technologies: string[] }>;
  certifications: Array<{ name: string; issuer?: string | null; issuedDate?: string | null }>;
  languages: Array<{ name: string; proficiency?: string | null }>;
}

export interface SectionConfig { type: SectionType; visible: boolean }
export interface Overrides { accent?: string; baseSizePt?: number; pageSize?: 'A4' | 'LETTER'; doc?: ResumeDoc }

export const SECTION_TITLES: Record<SectionType, string> = {
  summary: 'Summary', experience: 'Experience', skills: 'Skills', education: 'Education',
  projects: 'Projects', certifications: 'Certifications', languages: 'Languages',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatYm(ym?: string | null): string {
  if (!ym) return '';
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  return m ? `${MONTHS[+m[2] - 1]} ${m[1]}` : ym;
}
const range = (a?: string | null, b?: string | null, current = false) => {
  const from = formatYm(a); const to = current ? 'Present' : formatYm(b);
  return [from, to].filter(Boolean).join(' – ');
};

const MARGIN = { compact: 42, normal: 54, relaxed: 60 } as const;

export function defaultSections(t: TemplateVersionPackage): SectionConfig[] {
  return t.sectionOrder.map((type) => ({ type, visible: true }));
}

/** Only allowlisted, validated overrides are applied - no arbitrary CSS or coordinates. */
export function sanitizeOverrides(o: unknown): Overrides {
  const src = (o && typeof o === 'object' ? o : {}) as Record<string, unknown>;
  const out: Overrides = {};
  if (typeof src.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(src.accent)) out.accent = src.accent;
  if (typeof src.baseSizePt === 'number' && src.baseSizePt >= 9 && src.baseSizePt <= 12) out.baseSizePt = src.baseSizePt;
  if (src.pageSize === 'A4' || src.pageSize === 'LETTER') out.pageSize = src.pageSize;
  const doc = sanitizeDoc(src.doc); if (doc) out.doc = doc;
  return out;
}

/**
 * Overrides to persist on a write. Allowlisted. The visual-editor doc is PRESERVED when the incoming overrides do not mention it
 * (so the classic editor saving accent / font size / page size never wipes visual edits); doc: null explicitly resets to the profile.
 */
export function mergeOverridesOnWrite(incoming: unknown, current: unknown): Overrides {
  const next = sanitizeOverrides(incoming);
  const mentioned = !!incoming && typeof incoming === 'object' && 'doc' in (incoming as Record<string, unknown>);
  if (!mentioned) { const keep = sanitizeOverrides(current).doc; if (keep) next.doc = keep; }
  return next;
}

const safeLinks = (raw: unknown) =>
  (Array.isArray(raw) ? raw : [])
    .filter((l): l is { label: string; url: string } =>
      !!l && typeof l.label === 'string' && typeof l.url === 'string' && /^https?:\/\//i.test(l.url));

export function buildRenderModel(
  profile: ProfileInput, template: TemplateVersionPackage,
  sections: SectionConfig[] | undefined, overridesRaw: unknown,
): RenderModel {
  const ov = sanitizeOverrides(overridesRaw);
  const cfg = sections?.length ? sections : defaultSections(template);

  const build = (type: SectionType): RenderSection | null => {
    switch (type) {
      case 'summary':
        return profile.summary ? { type, title: SECTION_TITLES[type], text: profile.summary } : null;
      case 'experience': {
        const items: RenderItem[] = profile.experiences.map((e) => ({
          title: e.jobTitle, subtitle: [e.employerName, e.location].filter(Boolean).join(', '),
          meta: range(e.startDate, e.endDate, e.isCurrent), text: e.description ?? undefined,
          bullets: e.bullets.map((b) => b.content),
        }));
        return items.length ? { type, title: SECTION_TITLES[type], items } : null;
      }
      case 'skills': {
        if (!profile.skills.length) return null;
        const groups = new Map<string, string[]>();
        for (const s of profile.skills) {
          const k = s.category?.trim() || '';
          groups.set(k, [...(groups.get(k) ?? []), s.name]);
        }
        const items = [...groups.entries()].map(([k, names], gi) => ({
          id: `i_skills_${gi}`,
          title: k || undefined,
          tags: names,
        }));
        return { type, title: SECTION_TITLES[type], items };
      }
      case 'education': {
        const items = profile.educations.map((e, ei) => ({
          id: `i_education_${ei}`,
          title: [e.degree, e.field].filter(Boolean).join(', '), subtitle: e.institution,
          meta: range(e.startDate, e.endDate), text: e.grade ? `Grade: ${e.grade}` : undefined,
        }));
        return items.length ? { type, title: SECTION_TITLES[type], items } : null;
      }
      case 'projects': {
        const items = profile.projects.map((p, pi) => ({
          id: `i_projects_${pi}`,
          title: p.name, text: p.description ?? undefined, tags: p.technologies, url: p.url ?? undefined,
        }));
        return items.length ? { type, title: SECTION_TITLES[type], items } : null;
      }
      case 'certifications': {
        const items = profile.certifications.map((c, ci) => ({
          id: `i_certifications_${ci}`,
          title: c.name, subtitle: c.issuer ?? undefined, meta: formatYm(c.issuedDate),
        }));
        return items.length ? { type, title: SECTION_TITLES[type], items } : null;
      }
      case 'languages': {
        const items = profile.languages.map((l, li) => ({
          id: `i_languages_${li}`,
          title: l.name, meta: l.proficiency ?? undefined,
        }));
        return items.length ? { type, title: SECTION_TITLES[type], items } : null;
      }
    }
  };

  const model: RenderModel = {
    schemaVersion: 1,
    template: { id: template.id, version: template.version },
    page: { size: ov.pageSize ?? template.pageSizes[0], marginPt: MARGIN[template.theme.density ?? 'normal'] },
    layout: template.layout,
    sideSections: template.layout === 'two-column' ? (template.sideSections ?? []) : [],
    theme: { ...template.theme, accent: ov.accent ?? template.theme.accent, baseSizePt: ov.baseSizePt ?? template.theme.baseSizePt },
    header: {
      name: profile.fullName, headline: profile.headline ?? undefined,
      contacts: [profile.email, profile.phone, profile.location].filter((x): x is string => !!x),
      links: safeLinks(profile.links),
    },
    sections: cfg.filter((s) => s.visible).map((s) => build(s.type)).filter((s): s is RenderSection => !!s),
  };
  return ov.doc ? applyDoc(model, ov.doc) : model;
}

/** Visual-editor layer: the saved document replaces the profile-derived header text and sections (links stay from the profile). */
export function applyDoc(model: RenderModel, doc: ResumeDoc): RenderModel {
  return {
    ...model,
    header: { ...model.header, name: doc.header.name, headline: doc.header.headline || undefined, contacts: doc.header.contacts, photo: doc.header.photo },
    sections: doc.sections.filter((s) => !s.hidden).map(({ hidden: _hidden, ...s }) => s as RenderSection),
    styles: doc.styles,
  };
}
