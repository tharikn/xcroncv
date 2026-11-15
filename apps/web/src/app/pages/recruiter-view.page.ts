import { Component, OnInit, signal, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { arrowBackOutline, printOutline } from 'ionicons/icons';
import { InsightsApi, RecruiterView, RvAnnotation, RvItem, RvSection } from '../core/insights.api';
import { errorMessage } from '../core/notify.service';

/**
 * Recruiter View (doc 22): a read-only reading mode. It changes nothing in the resume, shows no score, and creates no public link.
 * Quick scan collapses long sections and always says what it collapsed; full content shows everything.
 */
@Component({
  selector: 'app-recruiter-view',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink],
  template: `
    <ion-header class="rv-noprint"><ion-toolbar><ion-title>Recruiter view</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell rv-shell">
        <div class="rv-noprint stack">
          <a class="btn ghost sm" [routerLink]="['/resumes', id]" style="align-self:flex-start"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> Back to resume</a>
          <section class="card" aria-label="View options" data-testid="rv-controls">
            <div class="row" role="group" aria-label="Reading mode">
              <button class="chip" [attr.aria-pressed]="mode() === 'quick'" (click)="setMode('quick')" data-testid="mode-quick">Quick scan</button>
              <button class="chip" [attr.aria-pressed]="mode() === 'full'" (click)="setMode('full')" data-testid="mode-full">Full content</button>
              <label class="checkbox"><input type="checkbox" [checked]="anonymize()" (change)="setAnon($any($event.target).checked)" data-testid="anonymize" /> Hide contact details</label>
              <label class="checkbox"><input type="checkbox" [checked]="notes()" (change)="setNotes($any($event.target).checked)" data-testid="show-notes" /> Show review notes</label>
              <button class="btn ghost sm" (click)="print()" data-testid="print"><ion-icon name="print-outline" aria-hidden="true"></ion-icon> Print</button>
            </div>
            <p class="small muted" data-testid="rv-readonly">Read-only view. Nothing here changes your resume. No public link is created. This shows how a reviewer might scan your resume; it is not a recruiter's decision.</p>
          </section>
        </div>

        @if (error()) { <div class="banner err" role="alert" data-testid="rv-error">{{ error() }}</div> }
        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true" data-testid="rv-loading"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @if (view(); as v) {
          @if (v.anonymized) { <div class="banner warn rv-noprint" role="status" data-testid="rv-anon-banner">Contact details are hidden in this view. Review the result before you share or print it.</div> }
          @if (v.collapsedSummary.hiddenItems + v.collapsedSummary.hiddenBullets + v.collapsedSummary.hiddenTags > 0) {
            <div class="banner rv-noprint" role="status" data-testid="rv-collapsed">{{ v.collapsedSummary.message }} <button class="btn sm" (click)="setMode('full')" data-testid="show-all">Show full content</button></div>
          }

          <main class="rv-doc" aria-label="Resume as a recruiter reads it" data-testid="rv-doc">
            <header class="rv-head">
              <h1 data-testid="rv-name">{{ v.identity.name }}</h1>
              @if (v.identity.headline) { <p class="rv-headline">{{ v.identity.headline }}</p> }
              @if (v.identity.targetRole) { <p class="rv-target small">Target role: {{ v.identity.targetRole }}</p> }
              <p class="small" data-testid="rv-contacts">{{ v.contacts.join(' · ') }}</p>
              @if (v.links.length) { <p class="small" data-testid="rv-links">@for (l of v.links; track $index) { @if (l.url) { <a [href]="l.url" target="_blank" rel="noopener noreferrer">{{ l.label }}</a> } @else { <span>{{ l.label }}</span> }{{ $last ? '' : ' · ' }} }</p> }
            </header>

            <section class="rv-overview" aria-label="At a glance" data-testid="rv-overview">
              <dl>
                @if (v.overview.currentRole) { <div><dt>Current / latest role</dt><dd>{{ v.overview.currentRole }}{{ v.overview.currentEmployer ? ', ' + v.overview.currentEmployer : '' }}</dd></div> }
                <div><dt>Experience</dt><dd data-testid="rv-years">{{ v.overview.statedExperienceYears === null ? 'Not shown (no explicit dates)' : v.overview.statedExperienceYears + ' years' }}<span class="small muted"> · {{ v.overview.roleCount }} role{{ v.overview.roleCount === 1 ? '' : 's' }}</span></dd></div>
                @if (v.overview.statedLevel) { <div><dt>Level (as titled)</dt><dd>{{ v.overview.statedLevel }}</dd></div> }
              </dl>
              @if (v.overview.coreSkills.length) { <p class="rv-chips" aria-label="Core skills">@for (s of v.overview.coreSkills; track s) { <span class="badge">{{ s }}</span> }</p> }
              <p class="small muted">{{ v.overview.note }}</p>
            </section>

            <nav class="rv-nav rv-noprint" aria-label="Sections" data-testid="rv-nav">
              @for (n of v.navigation; track n.type) { <button class="chip" (click)="jump(n.type)" [attr.data-testid]="'nav-' + n.type">{{ n.title }}</button> }
            </nav>

            @for (s of v.sections; track s.type) {
              <section class="rv-section" [id]="'rv-' + s.type" [attr.data-testid]="'rv-section-' + s.type" [attr.aria-labelledby]="'rv-h-' + s.type">
                <h2 [id]="'rv-h-' + s.type">{{ s.title }}</h2>
                @if (s.text) { <p>{{ s.text }}</p> }
                @for (a of sectionNotes(s); track a.id) { <div class="rv-note rv-noprint" data-testid="rv-note" [attr.data-rule]="a.ruleId"><strong>{{ a.title }}.</strong> {{ a.explanation }}</div> }
                @for (it of s.items; track it.index) {
                  <article class="rv-item" [class.collapsed]="it.collapsed" [attr.data-testid]="'rv-item-' + s.type + '-' + it.index">
                    <div class="rv-item-head"><strong>{{ it.title }}</strong>@if (it.meta) { <span class="rv-meta">{{ it.meta }}</span> }</div>
                    @if (it.subtitle) { <div class="small muted">{{ it.subtitle }}</div> }
                    @if (it.text) { <p>{{ it.text }}</p> }
                    @if (it.bullets.length) {
                      <ul>@for (b of it.bullets; track b.index) {
                        <li [class.rv-hl]="b.highlight"><span>{{ b.text }}</span>@if (b.matched.length) { <span class="badge ok rv-noprint">matches: {{ b.matched.join(', ') }}</span> }
                          @for (a of notesFor(s, it, b.index); track a.id) { <div class="rv-note rv-noprint" data-testid="rv-note" [attr.data-rule]="a.ruleId"><strong>{{ a.title }}.</strong> {{ a.explanation }}</div> }
                        </li>
                      }</ul>
                    }
                    @if (it.tags.length) { <p class="rv-chips">@for (t of it.tags; track t) { <span class="badge">{{ t }}</span> }</p> }
                    @if (it.hiddenBullets || it.hiddenTags) { <p class="small muted rv-noprint" data-testid="rv-hidden">{{ it.hiddenBullets ? it.hiddenBullets + ' more bullet' + (it.hiddenBullets === 1 ? '' : 's') : '' }}{{ it.hiddenBullets && it.hiddenTags ? ' and ' : '' }}{{ it.hiddenTags ? it.hiddenTags + ' more skills' : '' }} hidden in quick scan.</p> }
                    @for (a of itemNotes(s, it); track a.id) { <div class="rv-note rv-noprint" data-testid="rv-note" [attr.data-rule]="a.ruleId"><strong>{{ a.title }}.</strong> {{ a.explanation }}</div> }
                  </article>
                }
                @if (s.hiddenItems) { <p class="small muted rv-noprint" data-testid="rv-hidden-items">{{ s.hiddenItems }} more entr{{ s.hiddenItems === 1 ? 'y' : 'ies' }} collapsed (titles shown above).</p> }
              </section>
            }
          </main>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .rv-doc { background: #fff; color: #111; border: 1px solid var(--c-border); border-radius: var(--radius); padding: clamp(1rem, 4vw, 2.5rem); max-width: 52rem; width: 100%; margin-inline: auto; display: flex; flex-direction: column; gap: var(--space-4); }
    .rv-head h1 { font-size: clamp(1.6rem, 1.2rem + 2vw, 2.2rem); overflow-wrap: anywhere; }
    .rv-headline { font-size: 1.1rem; font-weight: 600; }
    .rv-overview { background: var(--c-surface); border-radius: var(--radius); padding: var(--space-3) var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); }
    .rv-overview dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: var(--space-3); }
    .rv-overview dt { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; color: var(--c-muted); }
    .rv-overview dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
    .rv-nav { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .rv-section h2 { font-size: 1.05rem; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid var(--c-border); padding-bottom: .25rem; margin-bottom: var(--space-2); }
    .rv-item { margin-bottom: var(--space-3); } .rv-item.collapsed { opacity: .8; }
    .rv-item-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-2); }
    .rv-meta { color: var(--c-muted); font-size: .9rem; }
    .rv-item ul { margin: .25rem 0 0 1.1rem; padding: 0; } .rv-item li { margin-bottom: .2rem; overflow-wrap: anywhere; }
    .rv-hl > span:first-child { background: rgba(255, 213, 0, .22); border-radius: 3px; }
    .rv-chips { display: flex; flex-wrap: wrap; gap: .35rem; margin: .35rem 0 0; }
    .rv-note { margin: .25rem 0; padding: .35rem .6rem; border-left: 3px solid var(--c-warn); background: var(--c-surface); font-size: .85rem; border-radius: 4px; }
    @media print {
      .rv-noprint, ion-header, .nav { display: none !important; }
      .rv-doc { border: 0; padding: 0; max-width: none; }
      .shell { position: static !important; display: block !important; }
    }
  `],
})
export class RecruiterViewPage implements OnInit {
  id = '';
  view = signal<RecruiterView | null>(null);
  mode = signal<'quick' | 'full'>('quick');
  anonymize = signal(false);
  notes = signal(false);
  loading = signal(true);
  error = signal('');

  constructor(private api: InsightsApi, private route: ActivatedRoute) { addIcons({ arrowBackOutline, printOutline }); }

  ngOnInit() { this.id = this.route.snapshot.paramMap.get('id')!; this.load(); }

  load() {
    this.loading.set(true);
    this.api.recruiterView(this.id, { mode: this.mode(), anonymize: this.anonymize(), annotations: this.notes() }).subscribe({
      next: (v) => { this.view.set(v); this.loading.set(false); this.error.set(''); },
      error: (e) => { this.error.set(e.status === 404 ? 'This resume was not found.' : errorMessage(e)); this.loading.set(false); },
    });
  }

  setMode(m: 'quick' | 'full') { this.mode.set(m); this.load(); }
  setAnon(v: boolean) { this.anonymize.set(v); this.load(); }
  setNotes(v: boolean) { this.notes.set(v); this.load(); }
  print() { window.print(); }
  jump(type: string) { document.getElementById('rv-' + type)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  /** Notes attached to a whole section (e.g. the summary). */
  sectionNotes(s: RvSection): RvAnnotation[] { return (this.view()?.annotations ?? []).filter((a) => a.section === s.type && a.itemIndex === undefined); }

  /** Notes attached to a specific bullet. */
  notesFor(s: RvSection, it: RvItem, bullet: number): RvAnnotation[] {
    return (this.view()?.annotations ?? []).filter((a) => a.section === s.type && a.itemIndex === it.index && a.bulletIndex === bullet);
  }
  /** Notes attached to an entry but not to one bullet. */
  itemNotes(s: RvSection, it: RvItem): RvAnnotation[] {
    return (this.view()?.annotations ?? []).filter((a) => a.section === s.type && a.itemIndex === it.index && a.bulletIndex === undefined);
  }
}
