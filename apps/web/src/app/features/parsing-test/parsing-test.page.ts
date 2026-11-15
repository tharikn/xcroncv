import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ResumeSummary } from '../../core/models';
import { errorMessage, NotifyService } from '../../core/notify.service';
import { SettingsService } from '../../core/settings.service';
import { checkUpload } from '../import/import-merge';
import { registerParsingTestIcons } from './parsing-test.icons';
import { Finding, Indicator, ReportMeta, RunResponse } from './parsing-test.types';

const IND_LABEL: Record<string, string> = { textExtracted: 'Text extracted', fieldsDetected: 'Fields detected', readingOrder: 'Reading order', layout: 'Layout' };
const IND_TEXT: Record<Indicator, string> = { ok: 'Good', warning: 'Check', problem: 'Problem', unknown: 'Not tested' };
const IND_ICON: Record<Indicator, string> = { ok: 'checkmark-circle-outline', warning: 'alert-circle-outline', problem: 'alert-circle-outline', unknown: 'help-circle-outline' };

/**
 * Resume Parsing Test (doc 21) + parser lab (doc 30). Separate route, service and report history.
 * Reports show what independent TEST parsers extracted; they never claim to emulate an employer ATS.
 */
@Component({
  selector: 'app-parsing-test',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, DatePipe],
  template: `
    <ion-header><ion-toolbar><ion-title>Parsing test</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Parsing test</h1>
          <p>Check whether software can read your exported resume. Results come from our own test parsers, not from any employer's system.</p></div></div>

        <section class="card" aria-labelledby="src-h" data-testid="pt-source">
          <h2 id="src-h">What do you want to test?</h2>
          <div class="row" role="radiogroup" aria-label="Test source">
            <label class="chip"><input type="radio" name="mode" value="resume" [(ngModel)]="mode" data-testid="mode-resume" /> A resume I created</label>
            <label class="chip"><input type="radio" name="mode" value="upload" [(ngModel)]="mode" data-testid="mode-upload" /> A file from my device</label>
          </div>

          @if (mode === 'resume') {
            <div class="form-grid">
              <div class="field"><label for="pt-resume">Resume</label>
                <select id="pt-resume" [(ngModel)]="resumeId" (ngModelChange)="loadHistory()" data-testid="pt-resume">
                  @for (r of resumes(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
                </select></div>
              <div class="field"><label for="pt-format">Export format</label>
                <select id="pt-format" [(ngModel)]="format" data-testid="pt-format"><option value="pdf">PDF</option><option value="docx">DOCX</option></select></div>
            </div>
            @if (!resumes().length && !loadingResumes()) { <p class="muted" data-testid="pt-no-resumes">You have no resumes yet. Create one first, or test a file from your device.</p> }
            <p class="muted small">We generate a fresh export in memory, test it against your resume's own data, and discard it. A score is shown because the correct answer is known.</p>
            <button class="btn" data-testid="pt-run" (click)="runResume()" [disabled]="busy() || !resumeId">Run parsing test</button>
          } @else {
            <div class="field" [class.invalid]="!!error()">
              <label for="pt-file">PDF or DOCX file (up to 5 MB)</label>
              <input id="pt-file" type="file" data-testid="pt-file" accept=".pdf,.docx" (change)="runUpload($event)" [disabled]="busy()" />
            </div>
            <p class="muted small">The file is read once in memory and discarded; its name is not stored. Because we do not know what your document should say, no score is shown, only diagnostics.</p>
          }
          @if (error()) { <p class="error" role="alert" data-testid="pt-error">{{ error() }}</p> }
          @if (busy()) { <p role="status" data-testid="pt-busy">Testing…</p> }
        </section>

        @if (result(); as r) {
          <section class="card" aria-labelledby="rep-h" data-testid="pt-report">
            <div class="row between">
              <h2 id="rep-h">Report</h2>
              <span class="badge">{{ r.report.format.toUpperCase() }} · {{ r.report.suiteVersion }}</span>
            </div>
            @if (r.report.score !== null) {
              <p class="stat" data-testid="pt-score"><strong>{{ r.report.score }}</strong><span class="muted"> / 100 Parsing Test Score</span></p>
            } @else {
              <p data-testid="pt-no-score"><span class="badge">No score</span> Diagnostics only</p>
            }
            <p class="muted small" data-testid="pt-score-note">{{ r.report.scoreNote }}</p>

            <ul class="row" style="flex-wrap:wrap;list-style:none;padding:0" aria-label="Status indicators" data-testid="pt-indicators">
              @for (k of indicatorKeys; track k) {
                <li class="badge" [class.ok]="r.report.indicators[k] === 'ok'" [class.warn]="r.report.indicators[k] !== 'ok'" [attr.data-testid]="'ind-' + k">
                  <ion-icon [name]="icon(r.report.indicators[k])" aria-hidden="true"></ion-icon>&nbsp;{{ labels[k] }}: {{ text(r.report.indicators[k]) }}
                </li>
              }
            </ul>
          </section>

          <section class="card" aria-labelledby="ad-h" data-testid="pt-adapters">
            <h2 id="ad-h">Test parsers</h2>
            <ul class="list">
              @for (a of r.report.adapters; track a.id) {
                <li class="item-card" [attr.data-testid]="'adapter-' + a.id">
                  <div class="row between"><strong>{{ a.name }}</strong><span class="badge">{{ a.version }}</span></div>
                  @if (a.error) { <p class="error" role="alert">Could not read this file: {{ a.error }}</p> }
                  @else {
                    <p class="small">{{ a.wordCount }} words, {{ a.lineCount }} lines. Found: name {{ yn(a.fields.name) }}, email {{ yn(a.fields.email) }}, phone {{ yn(a.fields.phone) }}, {{ a.fields.experienceEntries }} roles, {{ a.fields.educationEntries }} education, {{ a.fields.skills }} skills.</p>
                    @if (a.score !== null) {
                      <p class="small" data-testid="adapter-score">Score {{ a.score }}/100</p>
                      <details><summary>How the score is made</summary>
                        <ul>@for (b of breakdown(a.breakdown); track b.key) { <li>{{ b.key }}: {{ b.score }}/100 (weight {{ b.weight * 100 }}%)</li> }</ul>
                      </details>
                    }
                    <details><summary>What this parser can and cannot see</summary><ul>@for (c of a.capabilities; track c) { <li>{{ c }}</li> }</ul></details>
                  }
                </li>
              }
            </ul>
          </section>

          <section class="card" aria-labelledby="fi-h" data-testid="pt-findings">
            <h2 id="fi-h">Findings ({{ r.report.findings.length }})</h2>
            @if (!r.report.findings.length) { <p data-testid="pt-no-findings">No problems were found by these test parsers.</p> }
            <ul class="list">
              @for (f of r.report.findings; track $index) {
                <li class="item-card" [attr.data-testid]="'finding-' + f.id">
                  <p><span class="badge" [class.warn]="f.severity !== 'info'" [class.ok]="f.severity === 'info'">{{ f.severity }}</span>
                    <span class="muted small"> {{ f.id }} · {{ f.category }}{{ f.adapter ? ' · ' + f.adapter : '' }}</span></p>
                  <p>{{ f.message }}</p>
                  @if (f.expected) { <p class="small muted">Expected: {{ f.expected }}@if (f.extracted) { · Found: {{ f.extracted }} }</p> }
                  @if (f.suggestion) { <p class="small">Suggestion: {{ f.suggestion }}</p> }
                </li>
              }
            </ul>
          </section>

          @if (preview().length) {
            <section class="card" aria-labelledby="pv-h" data-testid="pt-preview">
              <h2 id="pv-h">Extracted text preview</h2>
              <p class="muted small">Shown once for this test and not stored. First {{ preview()[0].lines.length }} lines per parser.</p>
              @for (p of preview(); track p.adapter) {
                <details><summary>{{ p.adapter }}</summary><pre class="wrap small" style="white-space:pre-wrap">{{ p.lines.join('\n') }}</pre></details>
              }
            </section>
          } @else {
            <p class="muted small" data-testid="pt-no-preview">The text preview is not kept. Run the test again to see it.</p>
          }

          <section class="card" aria-labelledby="li-h"><h2 id="li-h">Limits of this test</h2>
            <ul>@for (l of r.report.limitations; track l) { <li class="small">{{ l }}</li> }</ul>
            <button class="btn ghost" data-testid="pt-rerun" (click)="rerun()" [disabled]="busy() || mode === 'upload'">Run again</button>
            @if (mode === 'upload') { <span class="hint"> Choose the file again to re-test after fixing it.</span> }
          </section>
        }

        @if (mode === 'resume' && history().length) {
          <section class="card" aria-labelledby="hi-h" data-testid="pt-history">
            <h2 id="hi-h">Earlier tests for this resume</h2>
            <ul class="list">
              @for (h of history(); track h.id) {
                <li class="row between" [attr.data-testid]="'hist-' + h.id">
                  <span>{{ h.createdAt | date: 'medium' }} · {{ h.format.toUpperCase() }} · {{ h.score !== null ? h.score + '/100' : 'no score' }} · {{ h.errors }} errors, {{ h.warnings }} warnings</span>
                  <span class="row"><button class="btn ghost sm" (click)="open(h)" data-testid="hist-open">Open</button>
                    <button class="btn danger sm" (click)="del(h)" data-testid="hist-delete">Delete</button></span>
                </li>
              }
            </ul>
          </section>
        }
      </div>
    </ion-content>
  `,
})
export class ParsingTestPage implements OnInit {
  readonly indicatorKeys = ['textExtracted', 'fieldsDetected', 'readingOrder', 'layout'] as const;
  readonly labels = IND_LABEL;
  mode: 'resume' | 'upload' = 'resume';
  format: 'pdf' | 'docx' = 'pdf';
  resumeId = '';
  resumes = signal<ResumeSummary[]>([]);
  loadingResumes = signal(true);
  busy = signal(false);
  error = signal('');
  result = signal<RunResponse | null>(null);
  preview = signal<Array<{ adapter: string; lines: string[] }>>([]);
  history = signal<ReportMeta[]>([]);

  constructor(private http: HttpClient, private settings: SettingsService, private api: ApiService, private notify: NotifyService) { registerParsingTestIcons(); }
  private url(p: string) { return `${this.settings.apiBase}${p}`; }

  async ngOnInit() {
    try { const list = await firstValueFrom(this.api.listResumes()); this.resumes.set(list); this.resumeId = list[0]?.id ?? ''; await this.loadHistory(); }
    catch (e) { this.error.set(errorMessage(e)); }
    this.loadingResumes.set(false);
  }

  icon(i: Indicator) { return IND_ICON[i]; }
  text(i: Indicator) { return IND_TEXT[i]; }
  yn(b: boolean) { return b ? 'found' : 'not found'; }
  breakdown(b: Record<string, { score: number; weight: number }> | null) { return Object.entries(b ?? {}).map(([key, v]) => ({ key, ...v })); }

  async loadHistory() {
    if (!this.resumeId) { this.history.set([]); return; }
    try { this.history.set(await firstValueFrom(this.http.get<ReportMeta[]>(this.url(`/resumes/${this.resumeId}/parsing-tests`)))); } catch { this.history.set([]); }
  }

  private async execute(call: () => Promise<RunResponse>) {
    this.error.set(''); this.busy.set(true);
    try { const r = await call(); this.result.set(r); this.preview.set(r.preview ?? []); await this.loadHistory(); }
    catch (e) { this.error.set(errorMessage(e)); }
    finally { this.busy.set(false); }
  }

  runResume() {
    return this.execute(() => firstValueFrom(this.http.post<RunResponse>(this.url(`/resumes/${this.resumeId}/parsing-tests`), { format: this.format })));
  }
  rerun() { return this.runResume(); }

  async runUpload(ev: Event) {
    const input = ev.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
    const problem = checkUpload(file);
    if (problem) { this.error.set(problem); input.value = ''; return; }
    const form = new FormData(); form.append('file', file, file.name);
    await this.execute(() => firstValueFrom(this.http.post<RunResponse>(this.url('/parsing-tests/upload'), form)));
    input.value = '';
  }

  async open(h: ReportMeta) {
    try { const r = await firstValueFrom(this.http.get<RunResponse>(this.url(`/parsing-tests/${h.id}`))); this.result.set(r); this.preview.set([]); }
    catch (e) { this.error.set(errorMessage(e)); }
  }

  async del(h: ReportMeta) {
    if (!(await this.notify.confirm('Delete this report?', 'The saved report is removed. Your resume is not affected.'))) return;
    try {
      await firstValueFrom(this.http.delete<void>(this.url(`/parsing-tests/${h.id}`)));
      if (this.result()?.id === h.id) this.result.set(null);
      await this.loadHistory();
    } catch (e) { this.error.set(errorMessage(e)); }
  }
}

export type { Finding };
