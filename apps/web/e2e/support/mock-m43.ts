/**
 * In-memory fake of module 43 (external profile and career data import). It mirrors the rules the UI relies on:
 * staging only, classification against the current profile, conflicts need a decision, confirm merges accepted items, undo restores.
 * Per-test state lives in a WeakMap keyed by the shared MockState. The upload itself is never stored.
 */
export interface Reply { status: number; data?: unknown }
const ok = (data: unknown, status = 200): Reply => ({ status, data });
const err = (status: number, message: string, extra: object = {}): Reply => ({ status, data: { message, ...extra } });

interface Field { id: string; section: string; label: string; value: any; confidence: string; sourceKind: string; sourceRef: string; parserVersion: string; importedAt: string; status: string }
interface Job { id: string; status: string; sourceKind: string; fields: Field[]; decisions: Record<string, string>; result: any; undo: any; createdAt: string; warnings: string[] }
const stores = new WeakMap<object, { seq: number; jobs: Job[] }>();
export function m43(state: object) { let s = stores.get(state); if (!s) { s = { seq: 0, jobs: [] }; stores.set(state, s); } return s; }

const n = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const now = () => new Date().toISOString();
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function sampleFields(sourceKind: string): Field[] {
  const mk = (i: number, section: string, label: string, value: any): Field => ({ id: `f${i}`, section, label, value, confidence: 'high', sourceKind, sourceRef: `${section} #${i}`, parserVersion: 'career-import-1.0.0', importedAt: now(), status: 'pending' });
  return [
    mk(1, 'profile', 'phone: +44 20 7946 1111', { field: 'phone', value: '+44 20 7946 1111' }),
    mk(2, 'profile', 'location: London', { field: 'location', value: 'London' }),
    mk(3, 'experience', 'Programmer at Babbage & Co', { employerName: 'Babbage & Co', jobTitle: 'Programmer', startDate: '2020-01', endDate: '2022-01', isCurrent: false, bullets: [{ content: 'Shipped the engine.' }] }),
    mk(4, 'experience', 'Analyst at Engines Ltd', { employerName: 'Engines Ltd', jobTitle: 'Analyst', startDate: '2018-01', endDate: '2019-12', isCurrent: false, bullets: [] }),
    mk(5, 'skill', 'Rust', { name: 'Rust' }),
    mk(6, 'skill', 'mathematics', { name: 'mathematics' }),
  ];
}

function classify(fields: Field[], p: any) {
  const conflicts: any[] = [];
  const out = fields.map((f) => {
    let kind = 'new'; let existing = ''; const differences: any[] = [];
    if (f.section === 'profile') {
      const cur = p?.[f.value.field];
      if (cur) { if (n(cur) === n(f.value.value)) kind = 'duplicate'; else { kind = 'conflict'; existing = String(cur); differences.push({ field: f.value.field, existing: cur, imported: f.value.value }); } }
    } else if (f.section === 'skill') kind = (p?.skills ?? []).some((s: any) => n(s.name) === n(f.value.name)) ? 'duplicate' : 'new';
    else if (f.section === 'experience') {
      const e = (p?.experiences ?? []).find((x: any) => n(x.employerName) === n(f.value.employerName));
      if (e) {
        const end = e.isCurrent ? 'present' : e.endDate ?? ''; const imp = f.value.isCurrent ? 'present' : f.value.endDate ?? '';
        if (end === imp) kind = 'duplicate'; else { kind = 'conflict'; existing = `${e.jobTitle} at ${e.employerName}`; differences.push({ field: 'endDate', existing: end, imported: imp }); }
      }
    }
    if (kind !== 'conflict') return { ...f, classification: kind };
    const c = { id: `c-${f.id}`, fieldId: f.id, section: f.section, existing, imported: f.label, differences, choices: f.section === 'profile' ? ['keep_existing', 'use_imported'] : ['keep_existing', 'use_imported', 'keep_both'] };
    conflicts.push(c);
    return { ...f, classification: 'conflict', conflictId: c.id };
  });
  return { fields: out, conflicts };
}

function counts(f: any[]) { const c = (p: (x: any) => boolean) => f.filter(p).length; return { total: f.length, pending: c((x) => x.status === 'pending'), accepted: c((x) => x.status === 'accepted'), rejected: c((x) => x.status === 'rejected'), merged: c((x) => x.status === 'merged'), new: c((x) => x.classification === 'new'), duplicate: c((x) => x.classification === 'duplicate'), conflict: c((x) => x.classification === 'conflict') }; }

function view(job: Job, state: any) {
  const base = { id: job.id, status: job.status, sourceKind: job.sourceKind, sizeBytes: 100, parserVersion: 'career-import-1.0.0', warnings: job.warnings, createdAt: job.createdAt, expiresAt: '2099-01-01T00:00:00.000Z', confirmedAt: null, undoable: !!job.undo };
  if (job.status !== 'review_ready') return { ...base, fields: job.fields, conflicts: [], decisions: job.decisions, result: job.result, counts: counts(job.fields) };
  const c = classify(job.fields, state.profile);
  return { ...base, fields: c.fields, conflicts: c.conflicts, decisions: job.decisions, result: null, counts: counts(c.fields) };
}

function plan(job: Job, state: any) {
  const { fields, conflicts } = classify(job.fields, state.profile);
  const changes: any[] = []; const unresolved: string[] = [];
  for (const f of fields.filter((x) => x.status === 'accepted')) {
    if (f.classification === 'duplicate') { changes.push({ fieldId: f.id, label: f.label, action: 'skip', reason: 'Already in your profile' }); continue; }
    if (f.classification === 'conflict') {
      const d = job.decisions[`c-${f.id}`];
      if (!d) { unresolved.push(`c-${f.id}`); continue; }
      if (d === 'keep_existing') { changes.push({ fieldId: f.id, label: f.label, action: 'skip', reason: 'You kept the existing value' }); continue; }
      changes.push({ fieldId: f.id, label: f.label, action: d === 'use_imported' ? 'replace' : 'add' }); continue;
    }
    changes.push({ fieldId: f.id, label: f.label, action: 'add' });
  }
  void conflicts;
  const c = (a: string) => changes.filter((x) => x.action === a).length;
  return { add: c('add'), replace: c('replace'), skip: c('skip'), unresolved, error: null, changes };
}

function apply(job: Job, state: any, p: ReturnType<typeof plan>) {
  const prof = state.profile ?? { fullName: 'New', links: [], experiences: [], skills: [], educations: [], projects: [], certifications: [], languages: [] };
  for (const ch of p.changes.filter((x: any) => x.action !== 'skip')) {
    const f = job.fields.find((x) => x.id === ch.fieldId)!;
    if (f.section === 'profile') prof[f.value.field] = f.value.value;
    else if (f.section === 'skill') prof.skills.push({ id: `s${prof.skills.length + 10}`, name: f.value.name });
    else if (f.section === 'experience') {
      const e = prof.experiences.find((x: any) => n(x.employerName) === n(f.value.employerName));
      if (ch.action === 'replace' && e) { e.endDate = f.value.endDate; e.isCurrent = false; }
      else prof.experiences.push({ id: `e${prof.experiences.length + 10}`, ...clone(f.value), bullets: f.value.bullets.map((b: any) => ({ kind: 'RESPONSIBILITY', content: b.content, isUserConfirmed: true })) });
    }
  }
  state.profile = prof;
}

export function handleM43(state: any, method: string, path: string, body: any, raw: string): Reply | undefined {
  const s = m43(state);
  if (path === '/provider-connections/linkedin/authorize' && method === 'POST') return err(501, 'No official import provider is connected in this deployment. Export your data from the other service as a file and import it here instead.');
  if (path === '/career-imports' && method === 'POST') {
    if (raw.includes('MOCK-UNSUPPORTED')) return err(415, 'Only PDF, DOCX, JSON and CSV files can be imported.');
    if (raw.includes('MOCK-BAD')) return err(400, 'That is not valid JSON.');
    const kind = /filename="[^"]*\.(csv|json|pdf|docx)"/i.exec(raw)?.[1]?.toLowerCase() ?? 'json';
    const job: Job = { id: `00000043-0000-4000-8000-${String(++s.seq).padStart(12, '0')}`, status: 'review_ready', sourceKind: kind, fields: sampleFields(kind), decisions: {}, result: null, undo: null, createdAt: now(), warnings: raw.includes('MOCK-WARN') ? ['Row 3: unknown type; skipped.'] : [] };
    s.jobs.unshift(job);
    return ok(view(job, state), 201);
  }
  if (path === '/career-imports' && method === 'GET') return ok(s.jobs.map((j) => ({ id: j.id, status: j.status, sourceKind: j.sourceKind, createdAt: j.createdAt, expiresAt: '2099-01-01T00:00:00.000Z', fieldCount: j.fields.length })));
  const m = /^\/career-imports\/([^/]+)(?:\/(preview|merge-preview|resolve-conflicts|confirm|undo))?$/.exec(path);
  if (!m) return undefined;
  const job = s.jobs.find((j) => j.id === m[1]); if (!job) return err(404, 'Import not found or expired');
  const sub = m[2];
  if (!sub && method === 'GET') return ok(view(job, state));
  if (!sub && method === 'DELETE') { s.jobs = s.jobs.filter((j) => j !== job); return ok(undefined, 204); }
  if (sub === 'undo' && method === 'POST') {
    if (job.status !== 'confirmed' || !job.undo) return err(409, 'There is nothing to undo for this import.');
    state.profile = clone(job.undo.before);
    job.fields = job.fields.map((f) => (f.status === 'merged' ? { ...f, status: 'accepted' } : f));
    job.status = 'review_ready'; job.undo = null; job.result = null;
    return ok(view(job, state));
  }
  if (job.status !== 'review_ready') return err(409, 'This import has already been confirmed.');
  if (sub === 'preview') {
    const ids = new Set(job.fields.map((f) => f.id)); const all = [...(body.accept ?? []), ...(body.reject ?? [])];
    if (all.some((x: string) => !ids.has(x))) return err(400, 'Unknown field ids');
    for (const f of job.fields) { if ((body.accept ?? []).includes(f.id)) f.status = 'accepted'; else if ((body.reject ?? []).includes(f.id)) f.status = 'rejected'; }
    return ok(view(job, state));
  }
  if (sub === 'resolve-conflicts') {
    for (const d of body.decisions ?? []) {
      if (d.choice === 'keep_both' && /^c-f[12]$/.test(d.conflictId)) return err(400, '"keep both" is not available for this item.');
      job.decisions[d.conflictId] = d.choice;
    }
    return ok(view(job, state));
  }
  if (sub === 'merge-preview') return ok(plan(job, state));
  if (sub === 'confirm') {
    if (body.confirm !== true) return err(400, 'Send {"confirm": true} to merge the accepted items.');
    const p = plan(job, state);
    if (p.unresolved.length) return err(409, 'Resolve every conflict before merging.', { unresolved: p.unresolved });
    if (!p.add && !p.replace) return err(400, 'Nothing to merge: accept at least one new or changed item.');
    job.undo = { before: clone(state.profile) };
    apply(job, state, p);
    job.fields = job.fields.map((f) => (p.changes.some((c: any) => c.fieldId === f.id && c.action !== 'skip') ? { ...f, status: 'merged' } : f));
    job.status = 'confirmed'; job.result = { add: p.add, replace: p.replace, skip: p.skip, unresolved: [], error: null, changes: p.changes };
    return ok(view(job, state));
  }
  return undefined;
}
