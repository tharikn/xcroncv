import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { UsageApi, UsageReport } from '../core/usage.api';

/** Doc 16 admin usage analytics: aggregate-only, admin role required (API returns 403 otherwise). */
@Component({
  selector: 'app-admin-usage',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, FormsModule],
  template: `
    <ion-header><ion-toolbar><ion-title>Usage analytics</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Usage analytics</h1><p>Aggregate product usage. No resume content or per-user data.</p></div></div>
        <section class="card flat">
          <div class="field"><label for="u-platform">Platform</label>
            <select id="u-platform" data-testid="usage-platform" [ngModel]="platform()" (ngModelChange)="platform.set($event); load()">
              <option value="">All</option><option value="WEB">Web</option><option value="ANDROID">Android</option>
            </select></div>
        </section>
        @if (error()) { <div class="banner err" role="alert" data-testid="usage-error">{{ error() }}</div> }
        @if (loading()) { <div class="sk-stack" role="status" aria-busy="true" data-testid="usage-loading"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }
        @else { @if (report(); as r) {
          <div class="grid" role="list" data-testid="usage-kpis">
            @for (k of kpis(); track k[0]) { <div class="card" role="listitem"><h2>{{ k[1] }}</h2><p class="big">{{ k[0] }}</p></div> }
          </div>
          <section class="card flat"><h2>Funnel (distinct users)</h2>
            <table data-testid="usage-funnel"><thead><tr><th scope="col">Stage</th><th scope="col">Users</th></tr></thead>
              <tbody>@for (f of r.funnel; track f.stage) { <tr><td>{{ f.stage }}</td><td>{{ f.users }}</td></tr> }</tbody></table></section>
          <section class="card flat"><h2>Templates</h2>
            @if (r.templates.length === 0) { <p class="muted" data-testid="usage-empty">No template activity in this range.</p> }
            @else { <table data-testid="usage-templates"><thead><tr><th scope="col">Template</th><th scope="col">Version</th><th scope="col">Events</th><th scope="col">Users</th></tr></thead>
              <tbody>@for (t of r.templates; track t.templateId + t.templateVersion) { <tr><td>{{ t.templateId }}</td><td>{{ t.templateVersion ?? '-' }}</td><td>{{ t.events }}</td><td>{{ t.users ?? '<3' }}</td></tr> }</tbody></table> }
          </section>
          <section class="card flat"><h2>AI</h2><p>{{ r.ai.requests }} requests, {{ r.ai.failed }} failed, est. cost {{ (r.ai.estimatedCostMicros / 1000000).toFixed(2) }}</p></section>
          <ul class="muted small">@for (n of r.notes; track n) { <li>{{ n }}</li> }</ul>
        } 
        }
      </div>
    </ion-content>
  `,
  styles: [`.big { font-size: 1.75rem; font-weight: 600; margin: 0; } table { width: 100%; border-collapse: collapse; } th, td { text-align: left; padding: .35rem .5rem; }`],
})
export class AdminUsagePage implements OnInit {
  report = signal<UsageReport | null>(null);
  loading = signal(true);
  error = signal('');
  platform = signal('');
  constructor(private api: UsageApi) {}
  ngOnInit() { this.load(); }
  kpis() {
    const k = this.report()?.kpis ?? {};
    const label: Record<string, string> = { resumesCreated: 'Resumes created', activeDesigners: 'Active designers', exportRequests: 'Export requests', exportsSucceeded: 'Exports succeeded', localSavesConfirmed: 'Local saves confirmed', previews: 'Previews', atsReports: 'ATS reports' };
    return Object.entries(label).map(([key, name]) => [k[key] ?? 0, name] as const);
  }
  load() {
    this.loading.set(true); this.error.set('');
    this.api.report({ platform: this.platform() }).subscribe({
      next: (r) => { this.report.set(r); this.loading.set(false); },
      error: (e: HttpErrorResponse) => {
        this.report.set(null); this.loading.set(false);
        this.error.set(e.status === 403 ? 'Admin access is required to view usage analytics.' : 'Could not load usage analytics. Try again.');
      },
    });
  }
}
