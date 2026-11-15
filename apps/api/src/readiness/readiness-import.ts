import { ROLES, roleById, TAXONOMY_VERSION } from '../career-path/role-taxonomy';
import { TargetSkill } from './readiness-logic';

export interface ImportedTargets { source: 'JOB_DESCRIPTION' | 'CAREER_PATH_ROLE'; sourceId: string; targetRole: string; skills: TargetSkill[]; note: string }

/** Skills from the user's saved, normalised job-description requirements (module 23/29). Only included skill requirements are used. */
export function targetsFromJobDescription(jd: { id: string; title: string; requirements: unknown }): ImportedTargets {
  const reqs = Array.isArray(jd.requirements) ? (jd.requirements as Array<Record<string, any>>) : [];
  const out = new Map<string, TargetSkill>();
  for (const r of reqs) {
    if (r?.included === false) continue;
    if (r?.type !== 'required_skill' && r?.type !== 'preferred_skill') continue;
    const name = String(r.label ?? '').trim().slice(0, 60);
    if (!name) continue;
    const importance = r.type === 'required_skill' ? 'required' : 'preferred';
    const prev = out.get(name.toLowerCase());
    if (!prev || (prev.importance === 'preferred' && importance === 'required')) out.set(name.toLowerCase(), { name, importance });
  }
  return {
    source: 'JOB_DESCRIPTION', sourceId: jd.id, targetRole: jd.title.slice(0, 120), skills: [...out.values()].slice(0, 40),
    note: 'Imported from your saved job description. Review and edit before creating a plan; nothing is added to your profile.',
  };
}

/** Skills from a career-path role in the versioned taxonomy (module 44). All are treated as required; the user can relax them. */
export function targetsFromRole(roleId: string): ImportedTargets | null {
  const role = roleById(roleId);
  if (!role) return null;
  return {
    source: 'CAREER_PATH_ROLE', sourceId: role.id, targetRole: role.title, skills: role.required.map((s) => ({ name: s.label, importance: 'required' as const })),
    note: `Imported from career-path taxonomy v${TAXONOMY_VERSION}. These are typical skills for the role, not a guarantee of any hiring outcome. Review and edit before creating a plan.`,
  };
}

export const roleOptions = () => ROLES.map((r) => ({ id: r.id, title: r.title, family: r.family }));
