import { Role, roleById, ROLES, TAXONOMY_VERSION } from './role-taxonomy';

/** Minimal profile shape the analysis needs (a structural subset of the Prisma profile). */
export interface ProfileLike {
  skills: Array<{ id: string; name: string; isUserConfirmed?: boolean }>;
  experiences: Array<{ id: string; jobTitle: string; employerName: string; isCurrent?: boolean; startDate?: string; description?: string | null; bullets: Array<{ content: string; isUserConfirmed?: boolean }> }>;
  projects: Array<{ id: string; name: string; description?: string | null; technologies: string[] }>;
}

export type EvidenceStatus = 'RECORDED_SKILL' | 'RECORDED_IN_EXPERIENCE' | 'NO_RECORDED_EVIDENCE';
export interface SkillAssessment { label: string; status: EvidenceStatus; evidence: Array<{ type: 'skill' | 'experience' | 'project'; id: string; label: string }> }
export interface PathOption {
  roleId: string; title: string; family: string; summary: string; taxonomyVersion: string;
  coverage: { covered: number; total: number };
  skills: SkillAssessment[]; transferable: string[]; noRecordedEvidence: string[];
  why: string[]; adjacentToCurrent: boolean; isTarget: boolean;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
/** Whole-token match so "go" does not match "google" and "r" does not match "react". */
export function mentions(text: string, alias: string): boolean {
  return new RegExp(`(?<![a-z0-9])${esc(alias.toLowerCase())}(?![a-z0-9])`).test(text.toLowerCase());
}

export function assess(profile: ProfileLike, role: Role): SkillAssessment[] {
  const skills = profile.skills.filter((s) => s.isUserConfirmed !== false);
  return role.required.map((req) => {
    const evidence: SkillAssessment['evidence'] = [];
    for (const sk of skills) if (req.aliases.some((a) => mentions(sk.name, a))) evidence.push({ type: 'skill', id: sk.id, label: sk.name });
    const listed = evidence.length > 0;
    for (const ex of profile.experiences) {
      const text = [ex.description ?? '', ...ex.bullets.filter((b) => b.isUserConfirmed !== false).map((b) => b.content)].join(' ');
      if (req.aliases.some((a) => mentions(text, a))) evidence.push({ type: 'experience', id: ex.id, label: `${ex.jobTitle} at ${ex.employerName}` });
    }
    for (const p of profile.projects) {
      if (req.aliases.some((a) => mentions([p.description ?? '', ...p.technologies].join(' '), a))) evidence.push({ type: 'project', id: p.id, label: p.name });
    }
    const status: EvidenceStatus = listed ? 'RECORDED_SKILL' : evidence.length ? 'RECORDED_IN_EXPERIENCE' : 'NO_RECORDED_EVIDENCE';
    return { label: req.label, status, evidence: evidence.slice(0, 4) };
  });
}

/** Role family the candidate most recently worked in, from the latest experience title. Null when nothing matches. */
export function currentRoleId(profile: ProfileLike): string | null {
  const sorted = [...profile.experiences].sort((a, b) => Number(!!b.isCurrent) - Number(!!a.isCurrent) || (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  const title = sorted[0]?.jobTitle?.toLowerCase();
  if (!title) return null;
  const specific = ROLES.find((r) => r.titleHints.some((h) => h !== 'software engineer' && title.includes(h)));
  if (specific) return specific.id;
  return title.includes('software engineer') ? 'backend-engineer' : null; // generic title: closest neutral family
}

export function toOption(profile: ProfileLike, role: Role, ctx: { currentId: string | null; targetId?: string }): PathOption {
  const skills = assess(profile, role);
  const covered = skills.filter((s) => s.status !== 'NO_RECORDED_EVIDENCE').length;
  const transferable = skills.filter((s) => s.status !== 'NO_RECORDED_EVIDENCE').map((s) => s.label);
  const none = skills.filter((s) => s.status === 'NO_RECORDED_EVIDENCE').map((s) => s.label);
  const adjacentToCurrent = !!ctx.currentId && (roleById(ctx.currentId)?.adjacent.includes(role.id) ?? false);
  const why: string[] = [];
  if (ctx.targetId === role.id) why.push('You chose this role as your target.');
  if (adjacentToCurrent) why.push(`It is a common step from ${roleById(ctx.currentId!)?.title}.`);
  if (transferable.length) why.push(`Your profile records evidence for ${covered} of ${role.required.length} typical requirements: ${transferable.join(', ')}.`);
  else why.push('Your profile does not yet record evidence for any typical requirement of this role.');
  return {
    roleId: role.id, title: role.title, family: role.family, summary: role.summary, taxonomyVersion: TAXONOMY_VERSION,
    coverage: { covered, total: role.required.length }, skills, transferable, noRecordedEvidence: none, why, adjacentToCurrent, isTarget: ctx.targetId === role.id,
  };
}

/** Explore: top options by recorded coverage, preferring natural next steps. Target: that role first, then its neighbours. */
export function analyzeProfile(profile: ProfileLike, opts: { targetRoleId?: string; limit?: number } = {}) {
  const currentId = currentRoleId(profile);
  const ctx = { currentId, targetId: opts.targetRoleId };
  let roles: Role[];
  if (opts.targetRoleId) {
    const t = roleById(opts.targetRoleId);
    roles = t ? [t, ...t.adjacent.map((a) => roleById(a)!).filter(Boolean)] : [];
  } else {
    roles = ROLES.filter((r) => r.id !== currentId);
  }
  const options = roles.map((r) => toOption(profile, r, ctx));
  if (!opts.targetRoleId) {
    options.sort((a, b) => Number(b.adjacentToCurrent) - Number(a.adjacentToCurrent) || b.coverage.covered / b.coverage.total - a.coverage.covered / a.coverage.total || a.title.localeCompare(b.title));
  }
  return {
    taxonomyVersion: TAXONOMY_VERSION,
    currentRole: currentId ? { id: currentId, title: roleById(currentId)!.title } : null,
    options: options.slice(0, opts.limit ?? 5),
    notes: [
      'Based only on facts in your confirmed profile. A missing item means no evidence is recorded yet, not that you lack the skill.',
      'This is not a prediction of hiring outcomes and does not rank your worth.',
    ],
  };
}

/** Editable starting milestones: document evidence you may already have, or build it. Never "you are missing X". */
export function suggestMilestones(option: Pick<PathOption, 'noRecordedEvidence'>): Array<{ title: string }> {
  return option.noRecordedEvidence.slice(0, 5).map((l) => ({ title: `Record or build evidence for: ${l}` }));
}
