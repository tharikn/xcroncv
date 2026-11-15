import { Component, Input } from '@angular/core';
import { PortfolioSnapshot, SectionKey } from '../core/profile-tools.api';

const SECTION_TITLES: Record<SectionKey, string> = {
  experience: 'Experience', projects: 'Projects', skills: 'Skills', education: 'Education', certifications: 'Credentials', languages: 'Languages',
};

type Row = Record<string, unknown>;

/**
 * Renders an allowlisted portfolio snapshot with Angular text bindings only (no innerHTML), so snapshot content can never
 * become executable markup. Used by the private preview and the public page, so both show exactly the same thing.
 */
@Component({
  selector: 'app-portfolio-render',
  standalone: true,
  template: `
    <article class="pf" [class.dark]="theme === 'dark'" [class.warm]="theme === 'warm'" data-testid="portfolio-render">
      @if (empty) { <p class="pf-muted" data-testid="portfolio-empty-render">Nothing is shared yet. Choose at least one field.</p> }
      <header class="pf-head">
        @if (str('fullName'); as n) { <h1 data-testid="pf-name-out">{{ n }}</h1> }
        @if (str('headline'); as h) { <p class="pf-headline" data-testid="pf-headline-out">{{ h }}</p> }
        <ul class="pf-contact">
          @if (str('location'); as l) { <li data-testid="pf-location-out">{{ l }}</li> }
          @if (str('email'); as e) { <li data-testid="pf-email-out">{{ e }}</li> }
          @if (str('phone'); as p) { <li data-testid="pf-phone-out">{{ p }}</li> }
          @for (l of links(); track l.url) { <li><a [href]="l.url" rel="noopener noreferrer nofollow" target="_blank">{{ l.label || l.url }}</a></li> }
        </ul>
      </header>
      @if (str('summary'); as s) { <section><h2>About</h2><p class="pf-text">{{ s }}</p></section> }
      @for (key of keys; track key) {
        @if (rows(key).length) {
          <section [attr.data-testid]="'pf-section-' + key">
            <h2>{{ titles[key] }}</h2>
            @if (key === 'skills') {
              <ul class="pf-tags">@for (r of rows(key); track $index) { <li>{{ r['name'] }}</li> }</ul>
            } @else {
              @for (r of rows(key); track $index) {
                <div class="pf-item">
                  <h3>{{ title(key, r) }}</h3>
                  @if (sub(key, r); as s) { <p class="pf-muted">{{ s }}</p> }
                  @if (r['description']) { <p class="pf-text">{{ r['description'] }}</p> }
                  @if (list(r['bullets']).length) { <ul class="pf-list">@for (b of list(r['bullets']); track $index) { <li>{{ b }}</li> }</ul> }
                  @if (list(r['technologies']).length) { <ul class="pf-tags">@for (t of list(r['technologies']); track $index) { <li>{{ t }}</li> }</ul> }
                  @if (url(r['url']); as u) { <a [href]="u" rel="noopener noreferrer nofollow" target="_blank">{{ u }}</a> }
                </div>
              }
            }
          </section>
        }
      }
    </article>
  `,
  styles: [`
    .pf { --pf-bg: #fff; --pf-fg: #1b1f24; --pf-muted: #5b6470; --pf-accent: #1f3a5f; --pf-line: #e3e6ea;
      background: var(--pf-bg); color: var(--pf-fg); border: 1px solid var(--pf-line); border-radius: 12px; padding: clamp(1rem, 4vw, 2.5rem);
      display: flex; flex-direction: column; gap: 1.5rem; min-width: 0; overflow-wrap: anywhere; }
    .pf.dark { --pf-bg: #14181d; --pf-fg: #eef1f4; --pf-muted: #a2acb8; --pf-accent: #8ab4f8; --pf-line: #2b323b; }
    .pf.warm { --pf-bg: #fbf6ee; --pf-fg: #2b2118; --pf-muted: #6e5d4b; --pf-accent: #9a4a1f; --pf-line: #e8dcc9; }
    .pf h1 { margin: 0; font-size: clamp(1.6rem, 5vw, 2.4rem); } .pf h2 { margin: 0 0 0.5rem; font-size: 1.1rem; color: var(--pf-accent); border-bottom: 1px solid var(--pf-line); padding-bottom: 0.25rem; }
    .pf h3 { margin: 0; font-size: 1rem; } .pf-headline { margin: 0.25rem 0 0; font-size: 1.1rem; color: var(--pf-muted); }
    .pf-muted { color: var(--pf-muted); margin: 0; } .pf-text { margin: 0.25rem 0 0; white-space: pre-wrap; }
    .pf-contact, .pf-tags, .pf-list { list-style: none; padding: 0; margin: 0.5rem 0 0; display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; }
    .pf-list { flex-direction: column; gap: 0.25rem; list-style: disc; padding-left: 1.25rem; }
    .pf-tags li { border: 1px solid var(--pf-line); border-radius: 999px; padding: 0.15rem 0.7rem; font-size: 0.9rem; }
    .pf-item { margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.25rem; } .pf a { color: var(--pf-accent); }
  `],
})
export class PortfolioRenderComponent {
  @Input({ required: true }) snapshot!: PortfolioSnapshot;
  @Input() theme = 'light';
  readonly keys = Object.keys(SECTION_TITLES) as SectionKey[];
  readonly titles = SECTION_TITLES;

  get empty() { return !Object.keys(this.snapshot?.header ?? {}).length && !this.keys.some((k) => this.rows(k).length); }
  str(f: string): string { const v = this.snapshot?.header?.[f]; return typeof v === 'string' ? v : ''; }
  links(): Array<{ label: string; url: string }> {
    const l = this.snapshot?.header?.['links'];
    return Array.isArray(l) ? l.filter((x) => this.url(x?.url)).map((x) => ({ label: String(x.label ?? ''), url: String(x.url) })) : [];
  }
  rows(k: SectionKey): Row[] { return this.snapshot?.sections?.[k] ?? []; }
  list(v: unknown): string[] { return Array.isArray(v) ? v.map(String) : []; }
  /** Defence in depth: only http(s) URLs become links, even though the API already filters them. */
  url(v: unknown): string { return typeof v === 'string' && /^https?:\/\//i.test(v) ? v : ''; }
  title(k: SectionKey, r: Row): string {
    switch (k) {
      case 'experience': return `${r['jobTitle']} · ${r['employerName']}`;
      case 'education': return `${r['degree']}${r['field'] ? ', ' + r['field'] : ''}`;
      default: return String(r['name'] ?? '');
    }
  }
  sub(k: SectionKey, r: Row): string {
    if (k === 'experience') return [r['location'], `${r['startDate']} - ${r['isCurrent'] ? 'Present' : r['endDate'] ?? ''}`].filter(Boolean).join(' · ');
    if (k === 'education') return [r['institution'], r['startDate'] && `${r['startDate']} - ${r['endDate'] ?? ''}`].filter(Boolean).join(' · ');
    if (k === 'certifications') return [r['issuer'], r['issuedDate']].filter(Boolean).join(' · ');
    if (k === 'languages') return String(r['proficiency'] ?? '');
    return '';
  }
}
