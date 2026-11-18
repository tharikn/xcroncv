import { Component, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubbleEllipsesOutline, closeOutline } from 'ionicons/icons';
import { ApiService } from '../../core/api.service';
import { ExportService } from '../../core/export.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { Resume } from '../../core/models';
import { errorMessage } from '../../core/notify.service';
import { VisualEditorComponent } from './visual-editor.component';
import { HelpChatStore } from '../../core/help-chat.api';
import { HelpChatComponent } from '../../shared/help-chat/help-chat.component';

/**
 * Route `resumes/:id/design`: full-height host for the visual editor (Step 3). Pages that embed the editor themselves
 * can use `<app-visual-editor>` directly; this route keeps it reachable on its own and is what the e2e suite drives.
 * Includes an in-app AI design assistant for color, layout, typography, section and save guidance.
 */
@Component({
  selector: 'app-visual-editor-page',
  standalone: true,
  imports: [IonContent, IonIcon, RouterLink, VisualEditorComponent, TranslatePipe, HelpChatComponent],
  template: `
    <ion-content [scrollY]="false">
      <div class="host">
        <div class="row actions" role="toolbar" [attr.aria-label]="'ve.pageActions' | t">
          <a class="btn ghost sm icon" [routerLink]="['/resumes', id]" data-testid="ve-back"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon></a>
          <span class="grow"></span>
          <button class="btn ghost sm" (click)="preview()" [disabled]="!r()" data-testid="ve-preview"><ion-icon name="eye-outline" aria-hidden="true"></ion-icon> {{ 've.preview' | t }}</button>
          <button class="btn sm" (click)="exp('pdf')" [disabled]="!r() || exporting()" data-testid="ve-export-pdf"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> PDF</button>
          <button class="btn ghost sm" (click)="exp('html')" [disabled]="!r() || exporting()" data-testid="ve-export-html">HTML</button>
        </div>
        @if (error()) { <div class="banner err" role="alert">{{ error() }}</div> }
        @if (r(); as res) { <app-visual-editor #ed [resume]="res" (saved)="r.set($event)"></app-visual-editor> }
        @else if (!error()) { <p class="muted" style="padding:var(--space-4)">{{ 'common.loading' | t }}</p> }
      </div>

      <!-- The shell hides its floating dock on editor routes, so this screen carries its own
           assistant console. It opens with design-specific suggested questions. -->
      @if (helpChat.available()) {
        <div class="ve-fab-dock">
          <app-help-chat></app-help-chat>
          <button
            type="button"
            class="fab fab-chatbot"
            data-testid="ve-chatbot"
            [class.is-open]="helpChat.open()"
            aria-controls="xcron-help"
            [attr.aria-expanded]="helpChat.open()"
            [attr.title]="(helpChat.open() ? 'chat.close' : 'chat.open') | t"
            [attr.aria-label]="(helpChat.open() ? 'chat.close' : 'chat.open') | t"
            (click)="helpChat.toggle()">
            <ion-icon [name]="helpChat.open() ? 'close-outline' : 'chatbubble-ellipses-outline'" aria-hidden="true"></ion-icon>
            <span class="fab-tooltip">{{ (helpChat.open() ? 'chat.close' : 'chat.open') | t }}</span>
          </button>
        </div>
      }
    </ion-content>
  `,
  styles: [`
    .host { height: 100%; display: flex; flex-direction: column; min-height: 0; position: relative; }
    .actions { padding: var(--space-2) var(--space-3); gap: var(--space-2); align-items: center; border-bottom: 1px solid var(--c-border); background: var(--c-bg); }

    /* Page-local assistant dock (shell dock is hidden on editor routes). */
    .ve-fab-dock {
      position: fixed;
      right: max(1.25rem, calc(env(safe-area-inset-right) + 1rem));
      bottom: max(2rem, calc(env(safe-area-inset-bottom) + 1.25rem));
      z-index: 200;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.9rem;
    }
    .fab {
      position: relative;
      width: 56px;
      height: 56px;
      flex: none;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: 0;
      color: #fff;
      font-size: 1.5rem;
      cursor: pointer;
      transition: transform 0.18s ease, box-shadow 0.18s ease;
    }
    .fab:hover { transform: translateY(-2px) scale(1.04); }
    .fab:active { transform: scale(0.97); }
    .fab-chatbot {
      background: var(--c-primary);
      box-shadow: 0 8px 22px color-mix(in srgb, var(--c-primary) 45%, transparent);
      border: 1px solid color-mix(in srgb, #fff 16%, transparent);
    }
    .fab-chatbot.is-open {
      background: var(--c-text);
      color: var(--c-bg);
      box-shadow: 0 8px 22px rgba(10, 6, 24, 0.35);
    }
    .fab-tooltip {
      position: absolute;
      right: calc(100% + 0.6rem);
      background: var(--c-text);
      color: var(--c-bg);
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.28rem 0.6rem;
      border-radius: 8px;
      white-space: nowrap;
      opacity: 0;
      transform: translateX(4px);
      transition: opacity 0.18s ease, transform 0.18s ease;
      pointer-events: none;
      box-shadow: 0 6px 16px rgba(10, 6, 24, 0.25);
    }
    .fab:hover .fab-tooltip, .fab:focus-visible .fab-tooltip { opacity: 1; transform: translateX(0); }
    @media (hover: none) { .fab-tooltip { display: none; } }

    @media (max-width: 991.98px) {
      .ve-fab-dock {
        right: max(1rem, calc(env(safe-area-inset-right) + 0.85rem));
        gap: 0.85rem;
      }
      .fab { width: 52px; height: 52px; font-size: 1.4rem; }
    }
  `],
})
export class VisualEditorPage implements OnInit, OnDestroy {
  id = '';
  r = signal<Resume | null>(null);
  error = signal('');
  exporting = signal(false);
  @ViewChild('ed') ed?: VisualEditorComponent;

  constructor(
    private api: ApiService,
    private route: ActivatedRoute,
    private router: Router,
    private exporter: ExportService,
    readonly helpChat: HelpChatStore,
  ) {
    addIcons({ chatbubbleEllipsesOutline, closeOutline });
  }

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.helpChat.setContext('design');
    this.helpChat.setResume(this.id);
    this.api.getResume(this.id).subscribe({ next: (res) => this.r.set(res), error: (e) => this.error.set(e.status === 404 ? 'Resume not found.' : errorMessage(e)) });
    void this.helpChat.load();
  }

  ngOnDestroy() {
    // The store lives in the shell; leave the generic chips for the next screen.
    this.helpChat.setContext(null);
    this.helpChat.clearResume();
  }

  /** Exports and preview always see the latest edits: flush the autosave first. */
  async preview() { if (await (this.ed?.flush() ?? Promise.resolve(true))) void this.router.navigate(['/resumes', this.id, 'preview']); }
  async exp(format: 'pdf' | 'html') {
    if (!(await (this.ed?.flush() ?? Promise.resolve(true)))) return;
    this.exporting.set(true);
    await this.exporter.exportAndSave(this.id, this.r()?.name || 'resume', format);
    this.exporting.set(false);
  }
}
