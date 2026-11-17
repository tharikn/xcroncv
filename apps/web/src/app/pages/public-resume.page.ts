import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { ApiService } from '../core/api.service';
import { RenderModel } from '../core/models';
import { errorMessage } from '../core/notify.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import { ResumeSheetComponent } from '../shared/resume-sheet.component';

@Component({
  selector: 'app-public-resume',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, TranslatePipe, ResumeSheetComponent],
  template: `
    <ion-header><ion-toolbar>
      <ion-title>{{ name() || ('public.sharedResume' | t) }}</ion-title>
    </ion-toolbar></ion-header>
    <ion-content [scrollY]="false">
      <div class="public-canvas">
        @if (error()) {
          <div class="banner err" role="alert" data-testid="public-resume-error">{{ 'public.notFound' | t }}</div>
        } @else if (!model()) {
          <p class="muted" aria-busy="true" data-testid="public-resume-loading">{{ 'public.loading' | t }}</p>
        } @else {
          <article class="sheet-card" data-testid="public-resume-sheet">
            <app-resume-sheet [model]="model()!" [fitWidth]="true" />
          </article>
          <p class="footer muted small">{{ 'public.footer' | t }}</p>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .public-canvas { height: 100%; overflow: auto; padding: var(--space-4); background: var(--c-canvas); display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
    .sheet-card { background: #fff; padding: var(--space-4); border-radius: var(--radius); box-shadow: 0 8px 28px rgba(0,0,0,0.08); width: 100%; max-width: 100%; overflow: hidden; }
    .footer { text-align: center; max-width: 40rem; }
  `],
})
export class PublicResumePage implements OnInit {
  token = '';
  model = signal<RenderModel | null>(null);
  name = signal('');
  error = signal('');
  constructor(private api: ApiService, private route: ActivatedRoute) {}
  ngOnInit() {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    this.api.publicResume(this.token).subscribe({
      next: (r) => { this.model.set(r.model); this.name.set(r.name); },
      error: (e) => this.error.set(errorMessage(e)),
    });
  }
}