export const DOC_TYPES = ['BIO', 'PROJECT_PROFILE', 'REFERENCE_REQUEST', 'THANK_YOU', 'RESIGNATION', 'PROMOTION_CASE', 'ROLE_PROFILE'] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const TONES = ['formal', 'friendly'] as const;

export interface DocInputs { recipientName?: string; managerName?: string; relationship?: string; lastDay?: string; targetRole?: string; occasion?: string; experienceId?: string; projectId?: string }
export interface Section { id: string; heading: string; text: string; origin: 'PROFILE' | 'USER' }
export interface Evidence { type: 'experience' | 'skill' | 'project' | 'bullet'; id: string; label: string }
export interface Claim { sectionId: string; text: string; label: 'EVIDENCED' | 'USER_AUTHORED'; evidence: Evidence | null }

export interface ProfileForDocs {
  fullName: string; headline?: string | null;
  experiences: Array<{ id: string; jobTitle: string; employerName: string; isCurrent?: boolean; startDate?: string; endDate?: string | null; bullets: Array<{ id: string; kind: string; content: string; isUserConfirmed?: boolean }> }>;
  skills: Array<{ id: string; name: string; isUserConfirmed?: boolean }>;
  projects: Array<{ id: string; name: string; description?: string | null; technologies: string[] }>;
}

export const TYPE_INFO: Record<DocType, { label: string; inputs: Array<keyof DocInputs>; disclaimer?: string }> = {
  BIO: { label: 'Professional bio', inputs: [] },
  PROJECT_PROFILE: { label: 'Project profile', inputs: ['projectId'] },
  REFERENCE_REQUEST: { label: 'Reference-request email', inputs: ['recipientName', 'experienceId', 'relationship'] },
  THANK_YOU: { label: 'Thank-you note', inputs: ['recipientName', 'occasion'] },
  RESIGNATION: { label: 'Resignation letter', inputs: ['managerName', 'lastDay'], disclaimer: 'Neutral drafting support only. This is not legal or employment-rights advice; check your contract and local rules.' },
  PROMOTION_CASE: { label: 'Promotion case', inputs: ['targetRole'] },
  ROLE_PROFILE: { label: 'Internal role profile', inputs: [] },
};

const PLACEHOLDER = /\[add [^\]]+\]/g;
const confirmed = <T extends { isUserConfirmed?: boolean }>(xs: T[]) => xs.filter((x) => x.isUserConfirmed !== false);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function latest(p: ProfileForDocs, id?: string) {
  if (id) return p.experiences.find((e) => e.id === id);
  return [...p.experiences].sort((a, b) => Number(!!b.isCurrent) - Number(!!a.isCurrent) || (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
}

/** Deterministic drafts. Facts come from the confirmed profile with evidence links; everything the user must supply is a visible placeholder. */
export function buildDraft(type: DocType, p: ProfileForDocs, inputs: DocInputs, tone: (typeof TONES)[number] = 'formal'): { sections: Section[]; claims: Claim[] } {
  const sections: Section[] = []; const claims: Claim[] = [];
  const need = (v: string | undefined, what: string) => v?.trim() || `[add ${what}]`;
  const ex = latest(p, inputs.experienceId);
  const exEv = (e: NonNullable<typeof ex>): Evidence => ({ type: 'experience', id: e.id, label: `${e.jobTitle} at ${e.employerName}` });
  const greet = tone === 'friendly' ? 'Hi' : 'Dear';
  const close = tone === 'friendly' ? 'Thanks so much,' : 'Kind regards,';
  const add = (id: string, heading: string, text: string, origin: Section['origin'], cl: Array<[string, Evidence | null]> = []) => {
    sections.push({ id, heading, text, origin });
    for (const [t, e] of cl) claims.push({ sectionId: id, text: t, label: e ? 'EVIDENCED' : 'USER_AUTHORED', evidence: e });
  };
  const skills = confirmed(p.skills).slice(0, 5);

  switch (type) {
    case 'BIO': {
      if (ex) add('intro', 'Introduction', `${p.fullName} is a ${ex.jobTitle} at ${ex.employerName}.`, 'PROFILE', [[`${ex.jobTitle} at ${ex.employerName}`, exEv(ex)]]);
      else add('intro', 'Introduction', `${p.fullName}${p.headline ? `: ${p.headline}` : ''}.`, 'PROFILE');
      if (skills.length) add('skills', 'Skills', `Works with ${list(skills.map((s) => s.name))}.`, 'PROFILE', skills.map((s) => [s.name, { type: 'skill', id: s.id, label: s.name } as Evidence]));
      add('close', 'Closing', '[add a sentence about what you are looking for or enjoy outside work]', 'USER');
      break;
    }
    case 'PROJECT_PROFILE': {
      const pr = p.projects.find((x) => x.id === inputs.projectId) ?? p.projects[0];
      if (!pr) { add('name', 'Project', '[add the project name]', 'USER'); add('desc', 'What it does', '[add a short description]', 'USER'); break; }
      const ev: Evidence = { type: 'project', id: pr.id, label: pr.name };
      add('name', 'Project', pr.name, 'PROFILE', [[pr.name, ev]]);
      add('desc', 'What it does', pr.description?.trim() || '[add a short description]', pr.description ? 'PROFILE' : 'USER', pr.description ? [[pr.description, ev]] : []);
      if (pr.technologies.length) add('tech', 'Technology', `Built with ${list(pr.technologies)}.`, 'PROFILE', [[list(pr.technologies), ev]]);
      add('role', 'My role and outcome', '[add your role and the real outcome]', 'USER');
      break;
    }
    case 'REFERENCE_REQUEST': {
      add('greet', 'Greeting', `${greet} ${need(inputs.recipientName, 'recipient name')},`, 'USER');
      add('ask', 'Request', ex
        ? `I hope you are well. I am applying for new roles and would be grateful if you could act as a reference. We worked together at ${ex.employerName}${inputs.relationship ? ` (${inputs.relationship})` : ''}, when I was ${ex.jobTitle}.`
        : 'I hope you are well. I am applying for new roles and would be grateful if you could act as a reference. [add where and when we worked together]', ex ? 'PROFILE' : 'USER', ex ? [[`${ex.jobTitle} at ${ex.employerName}`, exEv(ex)]] : []);
      add('detail', 'Details', 'Please let me know if you are happy to help and I will send the role details and my latest resume.', 'PROFILE');
      add('sign', 'Sign-off', `${close}\n${p.fullName}`, 'PROFILE');
      break;
    }
    case 'THANK_YOU': {
      add('greet', 'Greeting', `${greet} ${need(inputs.recipientName, 'recipient name')},`, 'USER');
      add('thanks', 'Thanks', `Thank you for taking the time to speak with me about the ${need(inputs.occasion, 'occasion, for example interview')}. I enjoyed learning more about the role and the team.`, 'USER');
      add('detail', 'Specific point', '[add one thing you discussed that you found interesting]', 'USER');
      add('sign', 'Sign-off', `${close}\n${p.fullName}`, 'PROFILE');
      break;
    }
    case 'RESIGNATION': {
      add('greet', 'Greeting', `${greet} ${need(inputs.managerName, 'manager name')},`, 'USER');
      add('notice', 'Notice', ex
        ? `Please accept this letter as formal notice of my resignation from my position as ${ex.jobTitle} at ${ex.employerName}. My last day of work will be ${need(inputs.lastDay, 'last working day')}.`
        : `Please accept this letter as formal notice of my resignation. My last day of work will be ${need(inputs.lastDay, 'last working day')}.`, 'PROFILE', ex ? [[`${ex.jobTitle} at ${ex.employerName}`, exEv(ex)]] : []);
      add('handover', 'Handover', 'I will do what I can to hand over my work smoothly during my notice period.', 'PROFILE');
      add('sign', 'Sign-off', `${close}\n${p.fullName}`, 'PROFILE');
      break;
    }
    case 'PROMOTION_CASE': {
      add('role', 'Role sought', `${p.fullName} is seeking promotion to ${need(inputs.targetRole, 'target role')}${ex ? ` from ${ex.jobTitle} at ${ex.employerName}` : ''}.`, ex ? 'PROFILE' : 'USER', ex ? [[`${ex.jobTitle} at ${ex.employerName}`, exEv(ex)]] : []);
      const wins = (ex ? confirmed(ex.bullets).filter((b) => b.kind === 'ACHIEVEMENT') : []).slice(0, 5);
      if (wins.length) wins.forEach((b, i) => add(`win${i}`, i === 0 ? 'Recorded achievements' : `Achievement ${i + 1}`, b.content, 'PROFILE', [[b.content, { type: 'bullet', id: b.id, label: b.content.slice(0, 60) }]]));
      else add('wins', 'Recorded achievements', '[add your achievements with their real results]', 'USER');
      add('next', 'Readiness for the next level', '[add how you already work at the next level]', 'USER');
      break;
    }
    case 'ROLE_PROFILE': {
      if (ex) add('title', 'Role', `${ex.jobTitle}, ${ex.employerName}`, 'PROFILE', [[ex.jobTitle, exEv(ex)]]);
      else add('title', 'Role', '[add the role title]', 'USER');
      const resp = (ex ? confirmed(ex.bullets).filter((b) => b.kind === 'RESPONSIBILITY') : []).slice(0, 6);
      if (resp.length) add('resp', 'Responsibilities', resp.map((b) => `- ${b.content}`).join('\n'), 'PROFILE', resp.map((b) => [b.content, { type: 'bullet', id: b.id, label: b.content.slice(0, 60) } as Evidence] as [string, Evidence]));
      else add('resp', 'Responsibilities', '[add the main responsibilities]', 'USER');
      if (skills.length) add('skills', 'Skills used', list(skills.map((s) => s.name)), 'PROFILE', skills.map((s) => [s.name, { type: 'skill', id: s.id, label: s.name } as Evidence]));
      break;
    }
  }
  return { sections, claims };
}

export const placeholdersIn = (sections: Section[]) => sections.flatMap((s) => (s.text.match(PLACEHOLDER) ?? []).map((m) => ({ sectionId: s.id, placeholder: m })));

/** Evidence links must still resolve to confirmed items in the profile; profile saves recreate rows, so links can go stale. */
export function validateClaims(p: ProfileForDocs, claims: Claim[], sections: Section[]) {
  const exists = (e: Evidence) => {
    if (e.type === 'skill') return confirmed(p.skills).some((s) => s.id === e.id);
    if (e.type === 'project') return p.projects.some((x) => x.id === e.id);
    if (e.type === 'experience') return p.experiences.some((x) => x.id === e.id);
    return p.experiences.some((x) => confirmed(x.bullets).some((b) => b.id === e.id));
  };
  const stale = claims.filter((c) => c.evidence && !exists(c.evidence)).map((c) => ({ sectionId: c.sectionId, text: c.text.slice(0, 80), evidence: c.evidence }));
  const unverified = claims.filter((c) => c.label === 'USER_AUTHORED').length;
  const ph = placeholdersIn(sections);
  return { ok: stale.length === 0 && ph.length === 0, evidenced: claims.length - unverified, userAuthored: unverified, stale, placeholders: ph };
}

export function diffSections(a: Section[], b: Section[]) {
  const ids = [...new Set([...a.map((s) => s.id), ...b.map((s) => s.id)])];
  return ids.map((id) => {
    const x = a.find((s) => s.id === id); const y = b.find((s) => s.id === id);
    const status = !x ? 'ADDED' : !y ? 'REMOVED' : x.text === y.text ? 'UNCHANGED' : 'CHANGED';
    return { id, heading: (y ?? x)!.heading, status, before: x?.text ?? null, after: y?.text ?? null };
  });
}

export function renderText(title: string, sections: Section[], format: 'txt' | 'md'): string {
  const body = sections.map((s) => (format === 'md' ? `## ${s.heading}\n\n${s.text}` : s.text)).join('\n\n');
  return format === 'md' ? `# ${title}\n\n${body}\n` : `${body}\n`;
}
