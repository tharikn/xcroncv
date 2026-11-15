/**
 * Career readiness (doc 34). Deterministic and evidence-first: for each target skill it reports the strongest KIND of
 * recorded evidence, never a single employability score and never a hiring prediction. A missing skill is phrased as
 * "no recorded evidence", not as proof the person lacks it.
 */
export const ANALYSIS_VERSION = 'readiness-1';

export type EvidenceLevel = 'DEMONSTRATED' | 'PROJECT' | 'CERTIFICATION' | 'SELF_REPORTED' | 'NONE';
export type Importance = 'required' | 'preferred';
export interface TargetSkill { name: string; importance: Importance }
export interface EvidenceSource { type: 'EXPERIENCE' | 'PROJECT' | 'CERTIFICATION' | 'SKILL'; id: string; label: string }
export interface ProfileEvidence {
  experiences: Array<{ id: string; label: string; text: string }>;
  projects: Array<{ id: string; label: string; text: string }>;
  certifications: Array<{ id: string; label: string }>;
  skills: Array<{ id: string; name: string }>;
}
export interface SkillAnalysis {
  skill: string; importance: Importance; level: EvidenceLevel; sources: EvidenceSource[];
  transferableFrom: Array<{ skill: string; level: EvidenceLevel; sources: EvidenceSource[] }>;
  statement: string;
}
export interface Milestone { id: string; title: string; skill?: string; status: 'OPEN' | 'DONE' | 'DISMISSED'; note?: string; origin: 'RECOMMENDATION' | 'USER' }

export const LEVEL_LABEL: Record<EvidenceLevel, string> = {
  DEMONSTRATED: 'Demonstrated in experience', PROJECT: 'Shown in a project', CERTIFICATION: 'Certification recorded',
  SELF_REPORTED: 'Self-reported skill only', NONE: 'No recorded evidence',
};
const RANK: Record<EvidenceLevel, number> = { DEMONSTRATED: 4, PROJECT: 3, CERTIFICATION: 2, SELF_REPORTED: 1, NONE: 0 };

/** Groups of closely related skills used only to point at transferable evidence (never to claim a skill). */
const RELATED_GROUPS: string[][] = [
  ['postgresql', 'mysql', 'sql', 'sql server', 'oracle', 'sqlite', 'mariadb'],
  ['react', 'angular', 'vue', 'svelte'],
  ['aws', 'azure', 'gcp', 'google cloud'],
  ['docker', 'kubernetes', 'podman', 'containers'],
  ['python', 'ruby', 'php'],
  ['java', 'kotlin', 'c#', 'scala'],
  ['typescript', 'javascript'],
  ['jest', 'mocha', 'pytest', 'junit', 'testing'],
  ['jenkins', 'github actions', 'gitlab ci', 'ci/cd', 'circleci'],
  ['terraform', 'cloudformation', 'pulumi', 'ansible'],
  ['redis', 'memcached'],
  ['rest', 'graphql', 'grpc'],
  ['scrum', 'kanban', 'agile'],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** Whole-term, case-insensitive match that is safe for names like "C++", "C#", ".NET" and "Node.js". */
export function mentions(text: string, skill: string): boolean {
  const t = norm(skill);
  if (!t) return false;
  return new RegExp(`(^|[^a-z0-9+#])${esc(t)}(?![a-z0-9+#])`, 'i').test(text);
}

export function dedupeTargets(targets: TargetSkill[]): TargetSkill[] {
  const seen = new Map<string, TargetSkill>();
  for (const t of targets) {
    const k = norm(t.name);
    if (!k) continue;
    const prev = seen.get(k);
    if (!prev || (prev.importance === 'preferred' && t.importance === 'required')) seen.set(k, { name: t.name.trim(), importance: t.importance });
  }
  return [...seen.values()];
}

function evidenceFor(profile: ProfileEvidence, skill: string): { level: EvidenceLevel; sources: EvidenceSource[] } {
  const sources: EvidenceSource[] = [];
  let level: EvidenceLevel = 'NONE';
  const bump = (l: EvidenceLevel) => { if (RANK[l] > RANK[level]) level = l; };
  for (const e of profile.experiences) if (mentions(e.text, skill)) { sources.push({ type: 'EXPERIENCE', id: e.id, label: e.label }); bump('DEMONSTRATED'); }
  for (const p of profile.projects) if (mentions(p.text, skill)) { sources.push({ type: 'PROJECT', id: p.id, label: p.label }); bump('PROJECT'); }
  for (const c of profile.certifications) if (mentions(c.label, skill)) { sources.push({ type: 'CERTIFICATION', id: c.id, label: c.label }); bump('CERTIFICATION'); }
  for (const s of profile.skills) if (norm(s.name) === norm(skill)) { sources.push({ type: 'SKILL', id: s.id, label: s.name }); bump('SELF_REPORTED'); }
  return { level, sources: sources.slice(0, 6) };
}

function related(skill: string): string[] {
  const k = norm(skill);
  const out = new Set<string>();
  for (const g of RELATED_GROUPS) if (g.includes(k)) for (const r of g) if (r !== k) out.add(r);
  return [...out];
}

const statement = (skill: string, level: EvidenceLevel) => ({
  DEMONSTRATED: `${skill} appears in your recorded work experience.`,
  PROJECT: `${skill} appears in a recorded project, not yet in work experience.`,
  CERTIFICATION: `A recorded certification mentions ${skill}; add an example of using it.`,
  SELF_REPORTED: `${skill} is listed as a skill, but no experience or project shows it in use.`,
  NONE: `No recorded evidence of ${skill} yet. This does not mean you lack it; it means your profile does not show it.`,
}[level]);

export function analyse(profile: ProfileEvidence, targets: TargetSkill[]): SkillAnalysis[] {
  return dedupeTargets(targets).map((t) => {
    const { level, sources } = evidenceFor(profile, t.name);
    const transferableFrom: SkillAnalysis['transferableFrom'] = [];
    if (level === 'NONE' || level === 'SELF_REPORTED') {
      for (const r of related(t.name)) {
        const ev = evidenceFor(profile, r);
        if (RANK[ev.level] >= RANK.PROJECT) transferableFrom.push({ skill: r, level: ev.level, sources: ev.sources });
      }
    }
    return { skill: t.name, importance: t.importance, level, sources, transferableFrom: transferableFrom.slice(0, 3), statement: statement(t.name, level) };
  });
}

export function summarise(analysis: SkillAnalysis[]) {
  const counts: Record<EvidenceLevel, number> = { DEMONSTRATED: 0, PROJECT: 0, CERTIFICATION: 0, SELF_REPORTED: 0, NONE: 0 };
  for (const a of analysis) counts[a.level]++;
  const req = analysis.filter((a) => a.importance === 'required');
  return {
    total: analysis.length, counts,
    requiredWithoutEvidence: req.filter((a) => a.level === 'NONE').map((a) => a.skill),
    note: 'Counts of recorded evidence by kind. This is not a score and does not predict hiring outcomes.',
  };
}

const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Editable recommendations; every one is labelled origin RECOMMENDATION so the UI can say so. */
export function suggestMilestones(analysis: SkillAnalysis[]): Milestone[] {
  const out: Milestone[] = [];
  const order = [...analysis].sort((a, b) => (a.importance === b.importance ? 0 : a.importance === 'required' ? -1 : 1));
  for (const a of order) {
    if (a.level === 'NONE') {
      const via = a.transferableFrom[0];
      out.push({
        id: `m-${slug(a.skill)}`, skill: a.skill, status: 'OPEN', origin: 'RECOMMENDATION',
        title: via
          ? `Practise ${a.skill} with a small project, building on your ${via.skill} evidence, then add it to your profile`
          : `Practise ${a.skill} with a small project or exercise, then add it to your profile`,
      });
    } else if (a.level === 'SELF_REPORTED') {
      out.push({ id: `m-${slug(a.skill)}`, skill: a.skill, status: 'OPEN', origin: 'RECOMMENDATION', title: `Add one concrete example of using ${a.skill} to your experience or projects` });
    }
  }
  return out.slice(0, 12);
}

/** Refresh keeps every existing milestone (including user edits and dismissals) and only adds new recommendations. */
export function mergeMilestones(existing: Milestone[], suggested: Milestone[]): Milestone[] {
  const ids = new Set(existing.map((m) => m.id));
  return [...existing, ...suggested.filter((m) => !ids.has(m.id))];
}
