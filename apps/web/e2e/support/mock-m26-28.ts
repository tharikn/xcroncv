/**
 * In-memory fakes for modules 26 (achievement bank), 27 (evidence check) and 28 (versions/variants).
 * They mirror the API rules the UI depends on. Per-test state lives in a WeakMap keyed by the shared MockState.
 */
export interface Reply { status: number; data?: unknown }
const ok = (data: unknown, status = 200): Reply => ({ status, data });
const err = (status: number, message: string, extra: object = {}): Reply => ({ status, data: { message, ...extra } });

interface Fact { id: string; kind: string; origin: string; status: string; title: string; data: any; source: string | null; revision: number; updatedAt: string; confirmedAt: string | null }
interface Rev { factId: string; revision: number; note: string; createdAt: string; snapshot: any }
interface Store { seq: number; facts: Fact[]; revs: Rev[]; links: any[]; proposals: any[]; versions: Record<string, any[]>; variants: any[]; claimChecks: number; snapshotState: Record<string, any> }
const stores = new WeakMap<object, Store>();
export function m2628(state: object): Store {
  let s = stores.get(state);
  if (!s) { s = { seq: 0, facts: [], revs: [], links: [], proposals: [], versions: {}, variants: [], claimChecks: 0, snapshotState: {} }; stores.set(state, s); }
  return s;
}
const uuid = (s: Store, p: number) => `${String(p).padStart(8, '0')}-0000-4000-8000-${String(++s.seq).padStart(12, '0')}`;
const now = () => new Date().toISOString();
const SKILL_ALIAS: Record<string, string> = { js: 'JavaScript', ts: 'TypeScript', golang: 'Go' };

export function handleM2628(state: any, method: string, path: string, body: any, query: URLSearchParams): Reply | undefined {
  const s = m2628(state);

  /* ---------------- module 26 ---------------- */
  if (path === '/skill-taxonomy/normalize' && method === 'POST') {
    return ok({ version: '1.0.0', results: (body.names as string[]).map((n) => { const l = SKILL_ALIAS[n.toLowerCase()]; return { input: n, matched: !!l, label: l }; }) });
  }
  const addRev = (f: Fact, note: string) => s.revs.push({ factId: f.id, revision: f.revision, note, createdAt: now(), snapshot: { title: f.title, status: f.status, data: JSON.parse(JSON.stringify(f.data)) } });
  if (path === '/achievement-drafts' && method === 'POST') {
    const text = String(body.text ?? '').trim();
    if (text.length < 8) return err(400, 'Describe what you did in at least a short sentence.');
    const m = /\d[\d,.]*\s?(%|percent|x)/i.exec(text);
    const data: any = { action: text, skills: [], ...(m ? { metric: { value: m[0], label: 'Detected in your text', confirmed: false } } : {}) };
    const f: Fact = { id: uuid(s, 1), kind: 'ACHIEVEMENT', origin: 'USER_ENTERED', status: 'DRAFT', title: text.slice(0, 80), data, source: 'Written by you as rough text', revision: 1, updatedAt: now(), confirmedAt: null };
    s.facts.unshift(f); addRev(f, 'Draft created from rough text');
    return ok({ fact: f, missing: ['context', 'outcome', 'experienceRef'], hints: m ? [`We found "${m[0]}" in your text. It is only a suggestion until you confirm it is accurate.`] : [] }, 201);
  }
  if (path === '/career-facts') {
    if (method === 'GET') {
      const kind = query.get('kind'); const status = query.get('status');
      return ok(s.facts.filter((f) => (!kind || f.kind === kind) && (status ? f.status === status : f.status !== 'ARCHIVED')));
    }
    if (method === 'POST') {
      if (body.kind === 'ACHIEVEMENT' && !String(body.data?.action ?? '').trim()) return err(400, 'What you did is required');
      const data = body.data ?? {};
      if (body.confirmNow && data.metric && !data.metric.confirmed) return err(400, 'Confirm the number is accurate before confirming this achievement.');
      const f: Fact = { id: uuid(s, 2), kind: body.kind, origin: body.origin ?? 'USER_ENTERED', status: body.confirmNow ? 'CONFIRMED' : 'DRAFT', title: body.title, data, source: null, revision: 1, updatedAt: now(), confirmedAt: body.confirmNow ? now() : null };
      s.facts.unshift(f); addRev(f, 'Created'); return ok(f, 201);
    }
    if (method === 'DELETE') { if (query.get('confirm') !== 'all') return err(400, 'Add ?confirm=all'); const n = s.facts.length; s.facts = []; s.revs = []; return ok({ deleted: n }); }
  }
  if (path === '/career-facts/export' && method === 'GET') return ok({ exportedAt: now(), count: s.facts.length, facts: s.facts });
  const fm = /^\/career-facts\/([^/]+)(?:\/(confirm|archive|revisions|restore))?$/.exec(path);
  if (fm) {
    const f = s.facts.find((x) => x.id === fm[1]); if (!f) return err(404, 'Fact not found');
    const sub = fm[2];
    if (!sub && method === 'DELETE') { s.facts = s.facts.filter((x) => x.id !== f.id); return ok(undefined, 204); }
    if (!sub && method === 'PATCH') {
      const before = f.data.metric; f.data = body.data ? { ...body.data } : f.data;
      if (body.title) f.title = body.title;
      if (f.data.metric && JSON.stringify(before) !== JSON.stringify(f.data.metric)) { f.data.metric = { ...f.data.metric, confirmed: false }; if (f.status === 'CONFIRMED') { f.status = 'DRAFT'; f.confirmedAt = null; } }
      f.revision++; f.updatedAt = now(); addRev(f, 'Edited'); return ok(f);
    }
    if (sub === 'confirm') {
      if (f.data.metric && !f.data.metric.confirmed) { if (!body.confirmMetric) return err(400, 'Confirm the number is accurate before confirming this achievement.'); f.data.metric.confirmed = true; }
      f.status = 'CONFIRMED'; f.confirmedAt = now(); f.revision++; f.updatedAt = now(); addRev(f, 'Confirmed by you'); return ok(f);
    }
    if (sub === 'archive') { f.status = 'ARCHIVED'; f.revision++; addRev(f, 'Archived'); return ok(f); }
    if (sub === 'revisions') return ok(s.revs.filter((r) => r.factId === f.id).sort((a, b) => b.revision - a.revision));
    if (sub === 'restore') {
      const old = s.revs.find((r) => r.factId === f.id && r.revision === body.revision); if (!old) return err(404, 'Revision not found');
      f.title = old.snapshot.title; f.data = JSON.parse(JSON.stringify(old.snapshot.data)); f.status = old.snapshot.status === 'ARCHIVED' ? 'DRAFT' : old.snapshot.status; f.revision++; f.updatedAt = now();
      addRev(f, `Restored from revision ${body.revision}`); return ok(f);
    }
  }

  /* ---------------- module 27 ---------------- */
  const pcmp = /^\/resumes\/([^/]+)\/provenance\/compare$/.exec(path);
  if (pcmp && method === 'GET') {
    if (!state.resumes.some((r: any) => r.id === pcmp[1])) return err(404, 'Resume not found');
    const from = query.get('from') ?? ''; const to = query.get('to') ?? '';
    const label = (x: string) => (x === 'draft' ? 'Working draft' : `Version ${x}`);
    const sum = (n: number, direct: number) => ({ total: n, direct, partial: 0, ambiguous: 0, absent: n - direct, contradictory: 0, needsAttention: n - direct });
    const note = 'Both versions are checked against your current confirmed facts and profile. "No evidence linked" does not mean a statement is false.';
    if (from === to) return ok({ from: label(from), to: label(to), note, added: [], removed: [], changed: [], unchanged: 3, fromSummary: sum(3, 2), toSummary: sum(3, 2), addedNeedingEvidence: 0, removedWithoutEvidence: 0 });
    return ok({
      from: label(from), to: label(to), note,
      added: [{ key: 'k1', section: 'experience', kind: 'bullet', text: 'Led the engine team.', support: 'absent', evidence: [] }],
      removed: [{ key: 'k2', section: 'experience', kind: 'bullet', text: 'Mentored two juniors.', support: 'partial', evidence: ['Programmer: bullet'] }],
      changed: [{ text: 'Cut compute time by 90%.', kind: 'bullet', section: 'experience', from: 'partial', to: 'direct' }],
      unchanged: 2, fromSummary: sum(3, 1), toSummary: sum(3, 2), addedNeedingEvidence: 1, removedWithoutEvidence: 1,
    });
  }
  const pc = /^\/resumes\/([^/]+)\/provenance\/(check|links)$/.exec(path);
  if (pc) {
    if (!state.resumes.some((r: any) => r.id === pc[1])) return err(404, 'Resume not found');
    if (pc[2] === 'check' && method === 'POST') {
      s.claimChecks++;
      const confirmed = s.facts.filter((f) => f.status === 'CONFIRMED' && f.kind === 'ACHIEVEMENT');
      const linked = (key: string) => s.links.some((l) => l.claimKey === key);
      const claims = [
        { key: 'claim-algo-0000000000', section: 'experience', kind: 'bullet', text: 'Wrote the first published algorithm.', support: 'direct', origin: 'USER_ENTERED', issues: [], evidence: [{ id: 'bullet:b1', label: 'Programmer: bullet', excerpt: 'Wrote the first published algorithm.', confirmed: true, origin: 'USER_ENTERED' }] },
        { key: 'claim-lead-0000000000', section: 'experience', kind: 'bullet', text: 'Led a team of 12 engineers.', support: linked('claim-lead-0000000000') ? 'direct' : 'absent', origin: null, issues: [], evidence: linked('claim-lead-0000000000') ? [{ id: s.links[0].factId, label: 'Linked fact', excerpt: 'linked', confirmed: true, origin: 'USER_ENTERED', byUser: true }] : [] },
        { key: 'claim-cut-00000000000', section: 'experience', kind: 'bullet', text: 'Cut compute time by 70%.', support: 'contradictory', origin: 'USER_ENTERED', issues: ['The figure "70%" differs from "90%" in your evidence.'], evidence: [] },
      ];
      const c = (t: string) => claims.filter((x) => x.support === t).length;
      return ok({ resumeId: pc[1], versionNumber: null, checkedAt: now(), note: 'Support is checked against your confirmed facts and your own career profile. "Absent" means no evidence is linked yet, not that the statement is false. Nothing is changed by this check.',
        summary: { total: claims.length, direct: c('direct'), partial: c('partial'), ambiguous: c('ambiguous'), absent: c('absent'), contradictory: c('contradictory'), needsAttention: claims.length - c('direct') }, claims, _facts: confirmed.length });
    }
    if (pc[2] === 'links' && method === 'POST') {
      const fact = s.facts.find((f) => f.id === body.factId);
      if (!fact) return err(404, 'Fact not found');
      if (fact.status !== 'CONFIRMED') return err(400, 'Only confirmed facts can be used as evidence. Confirm the fact first.');
      const l = { id: uuid(s, 3), claimKey: body.claimKey, factId: body.factId }; s.links.push(l); return ok(l, 201);
    }
    if (pc[2] === 'links' && method === 'GET') return ok(s.links);
  }
  if (path === '/provenance/rewrites' && method === 'POST') {
    const nums = (t: string) => (t.match(/\d[\d,.]*%?/g) ?? []);
    const added = nums(body.proposed).filter((n) => !nums(body.original).includes(n));
    const lead = /\bled\b/i.test(body.proposed) && !/\bled\b/i.test(body.original) ? ['led'] : [];
    const unsupported = [...added.map((text) => ({ type: 'number', text, reason: 'This figure is not in your original text or confirmed evidence.' })), ...lead.map((text) => ({ type: 'leadership', text, reason: 'Leadership or ownership is claimed that is not in your evidence.' }))];
    const same = body.original.trim() === body.proposed.trim();
    const ow = body.original.split(/\s+/); const pw = body.proposed.split(/\s+/);
    const diff = [...ow.filter((w: string) => !pw.includes(w)).map((text: string) => ({ op: 'remove', text })), ...pw.map((text: string) => ({ op: ow.includes(text) ? 'keep' : 'add', text }))];
    const p = { id: uuid(s, 4), resumeId: body.resumeId ?? null, origin: body.origin ?? 'AI_REWRITTEN', original: body.original, proposed: body.proposed, diff, unsupported, verdict: same ? 'unchanged' : unsupported.length ? 'needs-approval' : 'safe', status: 'PENDING' };
    s.proposals.push(p); return ok(p, 201);
  }
  const rp = /^\/provenance\/rewrites\/([^/]+)\/(approve|reject)$/.exec(path);
  if (rp && method === 'POST') {
    const p = s.proposals.find((x) => x.id === rp[1]); if (!p) return err(404, 'Proposal not found');
    if (p.status !== 'PENDING') return err(409, `This proposal was already ${p.status.toLowerCase()}.`);
    if (rp[2] === 'reject') { p.status = 'REJECTED'; return ok(p); }
    const ack: string[] = (body.acknowledged ?? []).map((x: string) => x.toLowerCase());
    const missing = p.unsupported.filter((u: any) => !ack.includes(u.text.toLowerCase()));
    if (missing.length) return err(400, 'Confirm each new claim is true before approving.', { unacknowledged: missing });
    p.status = 'APPROVED'; return ok({ ...p, finalText: p.proposed });
  }

  /* ---------------- module 28 ---------------- */
  if (path === '/resume-variants' && method === 'GET') return ok(s.variants.map((v) => ({ ...v, name: state.resumes.find((r: any) => r.id === v.resumeId)?.name ?? 'Resume' })));
  const vm = /^\/resumes\/([^/]+)\/(variant|variants|draft|snapshots(?:\/compare|\/\d+(?:\/restore|\/export\/(?:pdf|docx))?)?)$/.exec(path);
  if (vm) {
    const id = vm[1]; const r = state.resumes.find((x: any) => x.id === id);
    if (!r) return err(404, 'Resume not found');
    const sub = vm[2]; const list = (s.versions[id] ??= []);
    if (sub === 'variant') {
      if (method === 'GET') return ok(s.variants.find((v) => v.resumeId === id) ?? { resumeId: id, kind: null });
      if (method === 'PUT') {
        if (body.kind === 'MASTER' && s.variants.some((v) => v.kind === 'MASTER' && v.resumeId !== id)) return err(409, 'You already have a master resume. Change its type first.');
        const cur = s.variants.find((v) => v.resumeId === id); if (cur) Object.assign(cur, body); else s.variants.push({ resumeId: id, ...body }); return ok(s.variants.find((v) => v.resumeId === id));
      }
    }
    if (sub === 'variants' && method === 'POST') {
      const copy = { ...r, id: uuid(s, 5), name: body.name }; state.resumes.unshift(copy);
      const variant = { resumeId: copy.id, kind: body.kind, parentResumeId: id, company: body.company }; s.variants.push(variant); return ok({ resume: copy, variant }, 201);
    }
    if (sub === 'draft' && method === 'PUT') {
      if (new Date(body.expectedUpdatedAt).getTime() !== new Date(r.updatedAt).getTime()) return err(409, 'This resume was changed somewhere else. Reload to see the latest version before saving.', { current: r });
      const { expectedUpdatedAt: _e, ...rest } = body;
      Object.assign(r, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)), { updatedAt: new Date(new Date(r.updatedAt).getTime() + 1000).toISOString() }); return ok(r);
    }
    if (sub === 'snapshots' && method === 'GET') return ok([...list].reverse().map(({ snapshot, ...v }) => v));
    if (sub === 'snapshots' && method === 'POST') {
      const v = { id: uuid(s, 6), versionNumber: list.length + 1, changeSummary: body.changeSummary ?? null, createdAt: now(), meta: { label: body.label ?? null, restoredFrom: null, templateId: r.templateId, templateVersion: 1, contentHash: `hash${list.length + 1}` }, snapshot: { headline: s.snapshotState[id]?.headline ?? 'v' + (list.length + 1) } };
      list.push(v); const { snapshot, ...pub } = v; return ok(pub, 201);
    }
    const sm = /^snapshots\/(\d+)(?:\/(restore|export\/(?:pdf|docx)))?$/.exec(sub);
    if (sub === 'snapshots/compare' && method === 'GET') {
      const from = query.get('from') ?? ''; const to = query.get('to') ?? '';
      const label = (x: string) => (x === 'draft' ? 'Working draft' : `Version ${x}`);
      if (from === to) return ok({ from: label(from), to: label(to), identical: true, counts: {}, header: [], sections: [], items: [], skills: { added: [], removed: [] }, design: [] });
      return ok({ from: label(from), to: label(to), identical: false, counts: { sections: 0, items: 2, bullets: 2, skills: 2, dates: 1, header: 1, design: 1 },
        header: [{ field: 'headline', before: 'Programmer', after: 'Lead Programmer' }], sections: [{ type: 'skills', title: 'Skills', change: 'moved' }],
        items: [{ section: 'Experience', label: 'Programmer - Babbage & Co', change: 'changed', fields: [{ field: 'dates', before: 'Jan 2020 - Present', after: 'Jan 2020 - May 2023' }], bulletsAdded: ['Led the engine team.'], bulletsRemoved: ['Mentored two juniors.'], datesChanged: { before: 'Jan 2020 - Present', after: 'Jan 2020 - May 2023' } }],
        skills: { added: ['Poetry'], removed: ['Logic'] }, design: [{ field: 'accent', before: '#000000', after: '#112233' }] });
    }
    if (sm) {
      const v = list.find((x) => x.versionNumber === Number(sm[1])); if (!v) return err(404, 'Version not found');
      if (!sm[2] && method === 'GET') return ok({ ...v, integrity: v.tampered ? { valid: false, hash: 'x' } : { valid: true, hash: v.meta.contentHash } });
      if (sm[2] === 'restore' && method === 'POST') {
        const nv = { id: uuid(s, 6), versionNumber: list.length + 1, changeSummary: `Restored from version ${v.versionNumber}`, createdAt: now(), meta: { ...v.meta, restoredFrom: v.versionNumber }, snapshot: v.snapshot };
        list.push(nv); const { snapshot, ...pub } = nv; return ok({ ...pub, layoutApplied: !!body.applyLayout });
      }
      if (sm[2]?.startsWith('export')) return ok('PK mock');
    }
  }
  return undefined;
}
