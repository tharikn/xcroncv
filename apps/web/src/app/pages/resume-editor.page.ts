import { TourService } from '../shared/tour/tour.service';
import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubbleEllipsesOutline, closeOutline, shieldCheckmarkOutline } from 'ionicons/icons';
import { ApiService } from '../core/api.service';
import { DesignPatch } from '../core/design-patch';
import { ExportService } from '../core/export.service';
import { HelpChatStore } from '../core/help-chat.api';
import { HelpChatComponent } from '../shared/help-chat/help-chat.component';
import { registerFlowIcons } from '../core/flow.icons';
import { LocaleService } from '../core/i18n/locale.service';
import { TranslatePipe } from '../core/i18n/translate.pipe';
import {
  Overrides, Resume, ResumeStatus, ResumeVersion, SECTION_LABELS, SectionConfig, TemplateSummary,
} from '../core/models';
import { errorMessage, NotifyService } from '../core/notify.service';
import { VisualEditorComponent } from '../features/visual-editor/visual-editor.component';
import { StepId } from '../shared/resume-stepper.component';
import { InsightsApi, QualityReview } from '../core/insights.api';
import { FeatureApi } from '../features/common/feature-api';
import { Report as AtsReport } from '../features/ats-engine/ats-engine.format';

@Component({
  selector: 'app-resume-editor',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, FormsModule, RouterLink, DatePipe, TranslatePipe, VisualEditorComponent, HelpChatComponent],
  template: `
    <ion-content [scrollY]="false" class="editor-content">
      <div class="editor-page">
        <div class="topbar" data-tour="editor-bar" role="toolbar" [attr.aria-label]="'ed.toolbar' | t">
          <a class="icon-btn" routerLink="/resumes" [attr.aria-label]="'ed.allResumes' | t" [title]="'ed.allResumes' | t" data-testid="editor-back"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon></a>

          <div class="name-box">
            <input data-testid="editor-name" class="name-input" [(ngModel)]="name" maxlength="100" [attr.aria-label]="'ed.resumeName' | t" (input)="markDirty()" />
            <button class="icon-btn" type="button" [attr.aria-label]="'ed.rename' | t" [title]="'ed.rename' | t" data-testid="editor-rename"><ion-icon name="pencil-outline" aria-hidden="true"></ion-icon></button>
          </div>

          <span class="badge" [class.warn]="isDirty()" [class.ok]="!isDirty()" data-testid="save-state" role="status">
            {{ saving() ? 'Saving…' : isDirty() ? 'Unsaved changes' : 'All changes saved' }}</span>

          <span class="grow"></span>

          <button class="icon-btn" (click)="undo()" [disabled]="!canUndo()" [attr.aria-label]="'ve.undo' | t" [title]="'ve.undo' | t" data-testid="editor-undo"><ion-icon name="arrow-undo-outline" aria-hidden="true"></ion-icon></button>
          <button class="icon-btn" (click)="redo()" [disabled]="!canRedo()" [attr.aria-label]="'ve.redo' | t" [title]="'ve.redo' | t" data-testid="editor-redo"><ion-icon name="arrow-redo-outline" aria-hidden="true"></ion-icon></button>

          <span class="sep" aria-hidden="true"></span>

          <button class="icon-btn" (click)="openPanel('sections')" [attr.aria-expanded]="panel() === 'sections'" [attr.aria-label]="'ed.sectionsPanel' | t" [title]="'ed.sectionsPanel' | t" data-testid="editor-sections-btn" data-tour="editor-sections-btn"><ion-icon name="list-outline" aria-hidden="true"></ion-icon></button>
          <button class="icon-btn" (click)="openPanel('design')" [attr.aria-expanded]="panel() === 'design'" [attr.aria-label]="'ed.designPanel' | t" [title]="'ed.designPanel' | t" data-testid="editor-design-btn"><ion-icon name="color-palette-outline" aria-hidden="true"></ion-icon></button>
          <button class="icon-btn" (click)="openPanel('versions')" [attr.aria-expanded]="panel() === 'versions'" [attr.aria-label]="'ed.versionsPanel' | t" [title]="'ed.versionsPanel' | t" data-testid="editor-versions-btn"><ion-icon name="time-outline" aria-hidden="true"></ion-icon></button>
          <button class="icon-btn" (click)="rearrange()" [attr.aria-label]="'ve.rearrange' | t" [title]="'ve.rearrange' | t" data-testid="editor-rearrange-btn" data-tour="editor-rearrange-btn"><ion-icon name="grid-outline" aria-hidden="true"></ion-icon></button>
          <button class="icon-btn" (click)="openQuality()" [attr.aria-expanded]="panel() === 'checks'" [attr.aria-label]="'ed.checks' | t" [title]="'ed.checks' | t" data-testid="editor-quality-btn" data-tour="editor-quality-btn"><ion-icon name="shield-checkmark-outline" aria-hidden="true"></ion-icon></button>

          <span class="sep" aria-hidden="true"></span>

          <button class="icon-btn" (click)="viewMenu.set(!viewMenu())" [attr.aria-expanded]="viewMenu()" [attr.aria-label]="'ed.view' | t" [title]="'ed.view' | t" data-testid="editor-view-btn"><ion-icon name="search-outline" aria-hidden="true"></ion-icon></button>

          <span class="sep" aria-hidden="true"></span>

          <a class="icon-btn" [routerLink]="['/templates']" [queryParams]="{ resumeId: r()?.id }" [attr.aria-label]="'ed.templates' | t" [title]="'ed.templates' | t" data-testid="editor-templates"><ion-icon name="grid-outline" aria-hidden="true"></ion-icon></a>
          <button class="icon-btn" (click)="openShare()" [attr.aria-label]="'ed.share' | t" [title]="'ed.share' | t" data-testid="editor-share"><ion-icon name="share-social-outline" aria-hidden="true"></ion-icon></button>
          <button class="icon-btn" (click)="save()" [disabled]="saving() || !isDirty() || !name.trim()" [attr.aria-label]="'ed.save' | t" [title]="'ed.save' | t" data-testid="editor-save"><ion-icon name="save-outline" aria-hidden="true"></ion-icon></button>
          <button class="icon-btn" (click)="preview()" [attr.aria-label]="'ve.preview' | t" [title]="'ve.preview' | t" data-testid="editor-preview"><ion-icon name="eye-outline" aria-hidden="true"></ion-icon></button>

          <button class="btn sm ghost" (click)="goStep(4)" data-testid="editor-prev" [attr.aria-label]="'ed.previous' | t">
            <ion-icon name="chevron-back-outline" aria-hidden="true"></ion-icon> {{ 'ed.previous' | t }}</button>
          <button class="btn sm" data-tour="step-edit-action" data-testid="continue-export" (click)="continueToExport()" [disabled]="saving() || !name.trim()">
            {{ 'ed.continueExport' | t }} <ion-icon name="arrow-forward-outline" aria-hidden="true"></ion-icon></button>

          <button class="btn sm ghost" type="button" data-testid="editor-guide" (click)="tour.replayEditor()">{{ 'tour.guide' | t }}</button>
        </div>

        @if (viewMenu()) {
          <div class="view-pop" role="dialog" data-testid="view-pop">
            <button class="btn ghost sm" (click)="zoom(-0.1)" data-testid="ve-zoom-out"><ion-icon name="remove-outline" aria-hidden="true"></ion-icon> Zoom out</button>
            <span class="zoom">{{ edScale() }}%</span>
            <button class="btn ghost sm" (click)="zoom(0.1)" data-testid="ve-zoom-in"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> Zoom in</button>
            <button class="btn ghost sm" (click)="setFit('width')" data-testid="ve-fit-width">Fit width</button>
            <button class="btn ghost sm" (click)="setFit('page')" data-testid="ve-fit-page">Fit page</button>
          </div>
        }

        @if (error()) { <div class="banner err" role="alert" data-testid="editor-error">{{ error() }}</div> }
        @if (conflict()) { <div class="banner warn" role="alert" data-testid="editor-conflict">This resume was changed somewhere else, so your save was not applied. Your edits are still here.
          <button class="btn ghost sm" data-testid="editor-reload" (click)="reloadLatest()">Load the latest (discard my edits)</button></div> }
        @if (!r() && !error()) { <div class="sk-stack" role="status" aria-busy="true"><span class="sr-only">Loading…</span><span class="sk sk--title"></span><span class="sk sk--text"></span><span class="sk sk--text"></span></div> }

        @if (r(); as res) {
          @if (step() === 3) {
            <div class="canvas" data-testid="editor-live-preview" data-tour="editor-canvas">
              <app-visual-editor #ed [resume]="res" [showOutline]="false" [showBar]="false" (saved)="onVeSaved($event)" />
            </div>
          } @else {
            <div class="export-page" data-testid="export-step">
              <section class="card">
                <h2>{{ 'ed.exportTitle' | t }}</h2>
                <p class="muted">{{ 'ed.exportLead' | t }}</p>
                <div class="row">
                  <button class="btn" data-tour="step-export-action" data-testid="export-pdf" (click)="exp('pdf')" [disabled]="exporting() || saving()"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> {{ 'ed.exportPdf' | t }}</button>
                  <button class="btn ghost" data-testid="back-to-edit" (click)="goStep(3)"><ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> {{ 'ed.backToEdit' | t }}</button>
                </div>
                <div class="more" data-testid="more-formats">
                  <p class="muted small">{{ 'ed.moreFormats' | t }}</p>
                  <div class="row">
                    <button class="btn ghost" data-testid="export-html" (click)="exp('html')" [disabled]="exporting()"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> HTML</button>
                    <button class="btn ghost" data-testid="export-docx" (click)="exp('docx')" [disabled]="exporting()"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> DOCX</button>
                    <button class="btn ghost" data-testid="export-xlsx" (click)="exp('xlsx')" [disabled]="exporting()"><ion-icon name="cloud-download-outline" aria-hidden="true"></ion-icon> XLSX</button>
                    <a class="btn ghost" routerLink="/files" data-testid="export-folder-options">Save location</a>
                  </div>
                </div>
              </section>
            </div>
          }
        }

        @if (panel()) {
          <div class="drawer-backdrop" (click)="panel.set(null)" data-testid="panel-backdrop"></div>
          <aside class="side-panel" [class.open]="true" [class.wide]="panel() === 'checks'" [attr.aria-label]="'ed.panelAria' | t" data-testid="side-panel" data-tour="editor-side-panel">
            <div class="panel-head">
              <div class="tabs" role="tablist">
                <button role="tab" [attr.aria-selected]="panel() === 'sections'" (click)="panel.set('sections')" data-testid="tab-sections">{{ 'ed.sections' | t }}</button>
                <button role="tab" [attr.aria-selected]="panel() === 'design'" (click)="panel.set('design')" data-testid="tab-design">{{ 'ed.design' | t }}</button>
                <button role="tab" [attr.aria-selected]="panel() === 'versions'" (click)="panel.set('versions')" data-testid="tab-versions">{{ 'ed.versions' | t }}</button>
                <button role="tab" [attr.aria-selected]="panel() === 'checks'" (click)="panel.set('checks')" data-testid="tab-checks">{{ 'ed.checks' | t }}</button>
              </div>
              <button class="btn ghost sm icon" type="button" (click)="panel.set(null)" [attr.aria-label]="'ed.close' | t" data-testid="panel-close"><ion-icon name="close-outline" aria-hidden="true"></ion-icon></button>
            </div>

            @if (panel() === 'sections') {
              <section class="pcard">
                <h2>{{ 'ed.sections' | t }}</h2>
                <p class="muted small">Show or hide sections. Content is edited in your <a routerLink="/profile">career profile</a>.</p>
                <ul class="list" data-testid="section-list">
                  @for (s of sections; track s.type) {
                    <li class="item-card" [attr.data-testid]="'section-' + s.type">
                      <label class="checkbox grow"><input type="checkbox" [(ngModel)]="s.visible" [attr.data-testid]="'visible-' + s.type" /> {{ label(s.type) }}</label>
                    </li>
                  }
                </ul>
                <div class="row" style="margin-top:var(--space-2)">
                  <select #addSel data-testid="ve-add-section-type" style="min-height:var(--control-min-height)">
                    @for (k of kinds; track k) { <option [value]="k">{{ 've.type.' + k | t }}</option> }
                  </select>
                  <button class="btn sm" (click)="addSec(addSel.value)" data-testid="ve-add-section"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> {{ 've.add' | t }}</button>
                </div>
                <button class="btn ghost sm" (click)="resetToProfile()" data-testid="ve-reset-profile" style="margin-top:var(--space-2)">{{ 've.resetProfile' | t }}</button>
              </section>
            }

            @if (panel() === 'checks') {
              <section class="pcard checks-panel">
                <div class="checks-header">
                  <h2>{{ 'ed.checks' | t }}</h2>
                  <p class="checks-lead">{{ 'ed.checksLead' | t }}</p>
                </div>

                <div class="checks-actions">
                  <button class="btn" (click)="runQuality()" [disabled]="qualityBusy() || !r()" data-testid="editor-quality-run">{{ 'ed.checksRun' | t }}</button>
                  <button class="btn ghost" (click)="openAssistantFix()">{{ 'ed.askAssistant' | t }}</button>
                </div>

                <div class="checks-block">
                  @if (quality(); as q) {
                    <article class="score-card" [class.ready]="q.readiness === 'ready'" [class.needs-attention]="q.readiness !== 'ready'">
                      <span class="score-label">{{ 'ed.checksScore' | t }}</span>
                      <div class="score-body">
                        <span class="score-value" data-testid="editor-quality-score">{{ q.score }}</span>
                        <span class="badge score-badge" [class.ok]="q.readiness === 'ready'" [class.err]="q.readiness === 'needs_attention'" [class.warn]="q.readiness !== 'ready'" data-testid="editor-quality-readiness">{{ q.readiness }}</span>
                      </div>
                    </article>

                    @if (q.findings.length) {
                      <ul class="findings-list" data-testid="editor-quality-findings">
                        @for (f of q.findings.slice(0, 8); track f.id) {
                          <li class="finding-card severity-{{ f.severity }}">
                            <header class="finding-head">
                              <h4 class="finding-title">{{ f.title }}</h4>
                              <span class="badge sev" [class.err]="f.severity === 'critical'" [class.warn]="f.severity === 'warning'" [attr.data-testid]="'editor-quality-sev-' + f.severity">{{ f.severity }}</span>
                            </header>
                            @if (f.evidence.text) { <blockquote class="evidence-quote">{{ f.evidence.text }}</blockquote> }
                            <p class="finding-expl">{{ f.explanation }}</p>
                            <p class="finding-fix"><span class="fix-label">{{ 'ed.checksFix' | t }}</span> {{ f.recommendation }}</p>
                            @if (f.requiresUserConfirmation) { <span class="confirm-chip" data-testid="editor-quality-confirm">{{ 'ed.checksConfirm' | t }}</span> }
                          </li>
                        }
                      </ul>
                    } @else {
                      <p class="empty-state" data-testid="editor-quality-none">{{ 'ed.checksNone' | t }}</p>
                    }
                  } @else {
                    <p class="empty-state" data-testid="editor-quality-idle">{{ 'ed.checksIdle' | t }}</p>
                  }
                </div>

                <div class="checks-block">
                  <h3 class="block-title">{{ 'ed.checksAts' | t }}</h3>
                  @if (ats(); as a) {
                    <div class="ats-summary" data-testid="editor-ats-score">
                      <div>
                        <span class="ats-label">{{ 'ed.checksAtsScore' | t }}</span>
                        <div class="ats-score-row"><span class="ats-score">{{ a.score }}</span><span class="ats-denom">/ 100</span></div>
                      </div>
                      <span class="ats-job">{{ a.job.title }}{{ a.job.company ? ' - ' + a.job.company : '' }}</span>
                    </div>
                    @if (a.improvements.length) {
                      <ol class="ats-list" data-testid="editor-ats-improvements">
                        @for (s of a.improvements; track $index) { <li>{{ s }}</li> }
                      </ol>
                    }
                  } @else {
                    <p class="empty-state" data-testid="editor-ats-none">{{ 'ed.checksAtsNone' | t }}</p>
                  }
                </div>
              </section>
            }

            @if (panel() === 'design') {
              <section class="pcard">
                <h2>{{ 'ed.design' | t }}</h2>
                <div class="form-grid">
                  <div class="field"><label for="acc">Accent colour</label>
                    <div class="row"><input id="acc" data-testid="accent" type="color" [ngModel]="accent()" (ngModelChange)="ov.accent = $event" style="width:4rem" />
                      <button class="btn ghost sm" (click)="ov.accent = undefined">Template default</button></div></div>
                  <div class="field"><label for="primary">Primary button colour</label>
                    <div class="row"><input id="primary" data-testid="primary" type="color" [ngModel]="ov.primaryColor ?? accent()" (ngModelChange)="ov.primaryColor = $event" style="width:4rem" />
                      <button class="btn ghost sm" (click)="ov.primaryColor = undefined">Template default</button></div></div>
                  <div class="field"><label for="bs">Base font size: {{ ov.baseSizePt ?? templateSize() }} pt</label>
                    <input id="bs" data-testid="base-size" type="range" min="9" max="12" step="0.5" [ngModel]="ov.baseSizePt ?? templateSize()" (ngModelChange)="ov.baseSizePt = +$event" /></div>
                  <div class="field"><label for="sp">Section spacing</label>
                    <div class="row">
                      <label class="radio"><input type="radio" name="spacing" value="compact" [(ngModel)]="ov.sectionSpacing" (ngModelChange)="ov.sectionSpacing = 'compact'" [checked]="ov.sectionSpacing === 'compact'"/> Compact</label>
                      <label class="radio"><input type="radio" name="spacing" value="normal" [(ngModel)]="ov.sectionSpacing" (ngModelChange)="ov.sectionSpacing = 'normal'" [checked]="ov.sectionSpacing === 'normal'"/> Normal</label>
                      <label class="radio"><input type="radio" name="spacing" value="relaxed" [(ngModel)]="ov.sectionSpacing" (ngModelChange)="ov.sectionSpacing = 'relaxed'" [checked]="ov.sectionSpacing === 'relaxed'"/> Relaxed</label>
                    </div></div>
                  <div class="field"><label for="ps">Page size</label>
                    <select id="ps" data-testid="page-size" [ngModel]="ov.pageSize ?? 'A4'" (ngModelChange)="ov.pageSize = $event"><option value="A4">A4</option><option value="LETTER">US Letter</option></select></div>
                </div>
              </section>
            }

            @if (panel() === 'versions') {
              <section class="pcard">
                <div class="group-title"><h2>{{ 'ed.versions' | t }}</h2>
                  <button class="btn ghost sm" data-testid="save-version" (click)="saveVersion()" [disabled]="isDirty()" [attr.title]="isDirty() ? 'Save changes first' : null" data-tour="ve-save-version"><ion-icon name="copy-outline" aria-hidden="true"></ion-icon> {{ 've.saveVersion' | t }}</button></div>
                @if (versions().length === 0) { <p class="muted small" data-testid="no-versions">No saved versions yet. A version is an immutable snapshot you can return to.</p> }
                <ul class="list" data-testid="version-list">
                  @for (v of versions(); track v.id) {
                    <li class="row between"><span>Version {{ v.versionNumber }}<span class="muted small"> · {{ v.createdAt | date: 'medium' }}</span></span><span class="muted small wrap">{{ v.changeSummary }}</span></li>
                  }
                </ul>
              </section>
            }
          </aside>
        }
      </div>

      @if (shareOpen()) {
        <div class="share-backdrop" (click)="shareOpen.set(false)"></div>
        <div class="share-pop" role="dialog" [attr.aria-label]="'ed.shareTitle' | t" data-testid="share-pop">
          <div class="row between"><h3>{{ 'ed.shareTitle' | t }}</h3><button class="icon-btn" (click)="shareOpen.set(false)" data-testid="share-close"><ion-icon name="close-outline" aria-hidden="true"></ion-icon></button></div>
          <p class="muted small">{{ 'ed.shareLead' | t }}</p>
          @if (shareUrl()) {
            <div class="row"><input class="grow" readonly [value]="shareUrl()" data-testid="share-link" /><button class="btn sm" (click)="copyShareLink()" data-testid="share-copy">{{ 'ed.shareCopy' | t }}</button></div>
            <p class="muted small">{{ 'ed.sharePublicNote' | t }}</p>
            <button class="btn ghost sm danger" (click)="revokeShareLink()" data-testid="share-revoke">{{ 'ed.shareRevoke' | t }}</button>
          } @else {
            <button class="btn" (click)="createShareLink()" [disabled]="sharing()" data-testid="share-create">{{ 'ed.shareCreate' | t }}</button>
          }
        </div>
      }

      <!-- Design assistant: the shell hides its dock on editor routes, so this screen carries its own.
           Opens with template design suggestions (colour, layout, typography, sections, saving). -->
      @if (helpChat.available()) {
        <div class="ve-fab-dock">
          <app-help-chat (applyDesignSuggestion)="applyDesign($event)"></app-help-chat>
          <button
            type="button"
            class="fab fab-chatbot"
            data-testid="editor-chatbot"
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
    .editor-content { --background: var(--c-canvas); }
    .editor-page { height: 100%; display: flex; flex-direction: column; min-height: 0; position: relative; }
    .topbar { display: flex; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); min-height: 3.5rem; border-bottom: 1px solid var(--c-border); background: var(--c-bg); flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; -ms-overflow-style: none; }
    .topbar::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
    .icon-btn { display: inline-grid; place-items: center; width: 2.5rem; height: 2.5rem; border: 1px solid var(--c-border); border-radius: 8px; background: var(--c-bg); color: var(--c-text); cursor: pointer; flex: none; }
    .icon-btn:disabled { opacity: 0.45; cursor: default; }
    .icon-btn.ok { background: var(--c-primary); color: var(--c-primary-text); border-color: var(--c-primary); }
    .grow { flex: 1 1 auto; min-width: 0; }
    .sep { width: 1px; align-self: stretch; background: var(--c-border); margin: 0 var(--space-1); }
    .name-box { display: flex; align-items: center; gap: var(--space-1); min-width: 0; max-width: 18rem; }
    .name-input { border: 1px solid transparent; border-radius: 8px; padding: 0.35rem 0.5rem; font: inherit; font-weight: 700; font-size: 1.05rem; background: transparent; color: var(--c-text); min-width: 0; flex: 1 1 auto; }
    .name-input:focus { border-color: var(--c-primary); background: var(--c-bg); outline: none; }
    .badge { font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: var(--c-surface); border: 1px solid var(--c-border); }
    .badge.ok { background: color-mix(in srgb, var(--c-ok, #22c55e) 15%, transparent); border-color: color-mix(in srgb, var(--c-ok, #22c55e) 40%, transparent); }
    .badge.warn { background: color-mix(in srgb, var(--c-warn, #f5a524) 15%, transparent); }
    .view-pop { position: absolute; top: 3.25rem; right: var(--space-3); z-index: 25; background: var(--c-bg); border: 1px solid var(--c-border); border-radius: var(--radius); padding: var(--space-2); display: flex; align-items: center; gap: var(--space-2); box-shadow: 0 8px 28px rgba(0,0,0,0.2); }
    .zoom { min-width: 3rem; text-align: center; font-size: 0.85rem; color: var(--c-muted); }
    .canvas { flex: 1 1 auto; min-height: 0; position: relative; overflow: auto; scrollbar-width: auto; }
    .canvas::-webkit-scrollbar { width: 10px; height: 10px; }
    .canvas::-webkit-scrollbar-thumb { background: var(--c-border); border-radius: 5px; }
    .canvas app-visual-editor { display: block; height: 100%; }
    .export-page { flex: 1 1 auto; padding: var(--space-4); max-width: 48rem; margin: 0 auto; width: 100%; }
    .card { background: var(--c-bg); border: 1px solid var(--c-border); border-radius: var(--radius); padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
    .more { margin-top: var(--space-4); }
    .share-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 30; }
    .share-pop { position: fixed; top: 4rem; right: var(--space-3); z-index: 31; width: min(24rem, calc(100vw - 2 * var(--space-3))); background: var(--c-bg); border: 1px solid var(--c-border); border-radius: var(--radius); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); box-shadow: 0 8px 28px rgba(0,0,0,0.25); }
    .danger { color: var(--c-danger); }
    .sheet-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); z-index: 20; }
    .side-panel { position: fixed; top: 0; right: 0; width: min(22rem, 90vw); height: 100%; overflow: auto; z-index: 21; background: var(--c-bg); border-left: 1px solid var(--c-border); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-3); transform: translateX(100%); transition: transform 0.2s ease; }
    .side-panel.open { transform: translateX(0); }
    .panel-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
    .tabs { display: flex; gap: var(--space-1); }
    .tabs button { padding: 0.3rem 0.6rem; border: 1px solid var(--c-border); border-radius: 6px; background: transparent; cursor: pointer; }
    .tabs button[aria-selected="true"] { background: var(--c-primary); color: var(--c-primary-text); border-color: var(--c-primary); }
    .pcard { border-bottom: 1px solid var(--c-border); padding: var(--space-3) 0; }
    .pcard:last-child { border-bottom: 0; }
    .pcard h2 { font-size: 1rem; margin: 0 0 var(--space-2); }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-1); }
    .item-card { border: 1px solid var(--c-border); border-radius: 8px; padding: var(--space-2); }
    .group-title { display: flex; align-items: center; justify-content: space-between; }
    .row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; min-width: 0; }
    .row.between { justify-content: space-between; }
    .field { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
    .field > label, .field > .label { font-weight: 600; font-size: 0.9rem; }
    .form-grid { display: grid; gap: var(--space-3) var(--space-4); grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr)); }
    .field input, .field select { width: 100%; min-height: var(--control-min-height); padding: 0.55rem 0.75rem; border: 1px solid var(--c-border); border-radius: 8px; background: var(--c-bg); color: var(--c-text); font: inherit; }
    .field input[type='color'] { padding: 0.2rem; }
    .field input[type='range'] { padding: 0; accent-color: var(--c-primary); }
    .checkbox { display: inline-flex; align-items: center; gap: var(--space-1); }
    .radio { display: inline-flex; align-items: center; gap: var(--space-1); }
    .muted { color: var(--c-muted); }
    .small { font-size: 0.85rem; }
    .wrap { overflow-wrap: anywhere; }
    .grow { flex: 1 1 auto; min-width: 0; }
    .side-panel.wide { width: min(30rem, 92vw); }

    /* Quality & ATS panel */
    .checks-panel { display: flex; flex-direction: column; gap: var(--space-3); border-bottom: 0; padding-top: var(--space-2); }
    .checks-header h2 { margin: 0 0 var(--space-1); font-size: 1.15rem; letter-spacing: -0.01em; }
    .checks-lead { margin: 0; color: var(--c-muted); line-height: 1.55; font-size: 0.9rem; }
    .checks-actions { display: flex; flex-direction: column; gap: var(--space-2); }
    .checks-actions .btn { width: 100%; justify-content: center; }
    .checks-block { display: flex; flex-direction: column; gap: var(--space-2); }
    .block-title { margin: var(--space-1) 0 var(--space-1); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--c-muted); font-weight: 700; }

    .score-card {
      display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
      padding: var(--space-3); border: 1px solid var(--c-border); border-radius: 12px; background: var(--c-surface);
    }
    .score-card.ready { border-color: color-mix(in srgb, var(--c-ok, #22c55e) 40%, var(--c-border)); background: color-mix(in srgb, var(--c-ok, #22c55e) 8%, var(--c-surface)); }
    .score-card.needs-attention { border-color: color-mix(in srgb, var(--c-warn, #f5a524) 45%, var(--c-border)); background: color-mix(in srgb, var(--c-warn, #f5a524) 8%, var(--c-surface)); }
    .score-label { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c-muted); font-weight: 700; }
    .score-body { display: flex; align-items: center; gap: var(--space-2); }
    .score-value { font-size: 1.6rem; font-weight: 800; line-height: 1; color: var(--c-text); font-variant-numeric: tabular-nums; }
    .score-badge { text-transform: capitalize; }

    .findings-list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
    .finding-card {
      border: 1px solid var(--c-border); border-left: 4px solid var(--c-border); border-radius: 12px;
      padding: var(--space-3); background: var(--c-bg); display: flex; flex-direction: column; gap: var(--space-2);
    }
    .finding-card.severity-critical { border-left-color: var(--c-danger, #ef4444); }
    .finding-card.severity-warning { border-left-color: var(--c-warn, #f5a524); }
    .finding-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-2); }
    .finding-title { margin: 0; font-size: 0.92rem; font-weight: 650; line-height: 1.35; }
    .sev { text-transform: capitalize; font-size: 0.7rem; padding: 0.25rem 0.55rem; }
    .evidence-quote { margin: 0; padding: 0.45rem 0.6rem; border-left: 2px solid var(--c-border); background: var(--c-surface); border-radius: 8px; font-size: 0.85rem; color: var(--c-muted); overflow-wrap: anywhere; }
    .finding-expl { margin: 0; font-size: 0.86rem; line-height: 1.5; }
    .finding-fix { display: flex; align-items: flex-start; gap: 0.4rem; margin: 0; font-size: 0.86rem; line-height: 1.45; }
    .fix-label { font-weight: 700; color: var(--c-primary); white-space: nowrap; }
    .confirm-chip { align-self: flex-start; font-size: 0.72rem; padding: 0.2rem 0.5rem; border-radius: 999px; background: color-mix(in srgb, var(--c-warn, #f5a524) 15%, transparent); border: 1px solid color-mix(in srgb, var(--c-warn, #f5a524) 35%, transparent); }

    .ats-summary { border: 1px solid var(--c-border); border-radius: 12px; padding: var(--space-3); background: var(--c-surface); display: flex; flex-direction: column; gap: var(--space-1); }
    .ats-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--c-muted); font-weight: 700; }
    .ats-score-row { display: flex; align-items: baseline; gap: 0.35rem; }
    .ats-score { font-size: 1.45rem; font-weight: 800; color: var(--c-text); font-variant-numeric: tabular-nums; }
    .ats-denom { color: var(--c-muted); font-size: 0.9rem; }
    .ats-job { color: var(--c-muted); font-size: 0.85rem; overflow-wrap: anywhere; }
    .ats-list { margin: 0; padding-left: 1.25rem; display: grid; gap: 0.35rem; font-size: 0.9rem; line-height: 1.45; }
    .empty-state { margin: 0; padding: var(--space-3); text-align: center; border: 1px dashed var(--c-border); border-radius: 12px; color: var(--c-muted); background: var(--c-surface); font-size: 0.9rem; line-height: 1.5; }
    .sk-stack { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-4); }
    .sk { display: block; height: 1rem; border-radius: 6px; background: var(--c-surface); }
    .sk--title { height: 1.5rem; width: 60%; }
    .sk--text { width: 100%; }
    .banner { padding: var(--space-2) var(--space-3); border-radius: var(--radius); margin: var(--space-2) var(--space-3); }
    .banner.err { background: color-mix(in srgb, var(--c-danger, #ef4444) 12%, transparent); border: 1px solid var(--c-danger, #ef4444); }
    .banner.warn { background: color-mix(in srgb, var(--c-warn, #f5a524) 12%, transparent); border: 1px solid var(--c-warn, #f5a524); }
    .btn { display: inline-flex; align-items: center; gap: var(--space-1); min-height: var(--control-min-height); padding: 0 var(--space-3); border-radius: var(--radius); border: 1px solid var(--c-border); background: var(--c-primary); color: var(--c-primary-text); cursor: pointer; font: inherit; font-weight: 600; }
    .btn.ghost { background: transparent; color: var(--c-text); }
    .btn.sm { min-height: 2rem; padding: 0 var(--space-2); font-size: 0.85rem; }
    .btn.icon { padding: 0; width: 2.25rem; justify-content: center; }
    .btn:disabled { opacity: 0.45; cursor: default; }
    .btn.danger { color: var(--c-danger); }

    /* Page-local design-assistant dock (shell dock is hidden on editor routes). */
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
    .fab-chatbot.is-open { background: var(--c-text); color: var(--c-bg); box-shadow: 0 8px 22px rgba(10, 6, 24, 0.35); }
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
      .ve-fab-dock { right: max(1rem, calc(env(safe-area-inset-right) + 0.85rem)); gap: 0.85rem; }
      .fab { width: 52px; height: 52px; font-size: 1.4rem; }
    }
    @media (max-width: 767px) { .side-panel { top: auto; bottom: 0; left: 0; right: 0; width: 100%; height: 80vh; border-left: 0; border-top: 1px solid var(--c-border); transform: translateY(100%); } .side-panel.open { transform: translateY(0); } .drawer-backdrop, .panel-backdrop { display: block; } }
  `],
})
export class ResumeEditorPage implements OnInit, OnDestroy {
  id = '';
  r = signal<Resume | null>(null);
  templates = signal<TemplateSummary[]>([]);
  versions = signal<ResumeVersion[]>([]);
  error = signal('');
  saving = signal(false);
  conflict = signal(false);
  exporting = signal(false);
  step = signal<StepId>(3);
  panel = signal<'sections' | 'design' | 'versions' | 'checks' | null>(null);
  viewMenu = signal(false);
  shareOpen = signal(false);
  shareUrl = signal('');
  sharing = signal(false);
  quality = signal<QualityReview | null>(null);
  qualityBusy = signal(false);
  ats = signal<AtsReport | null>(null);
  private sub?: Subscription;
  @ViewChild('ed') ed?: VisualEditorComponent;
  name = ''; role = ''; status: ResumeStatus = 'DRAFT';
  sections: SectionConfig[] = [];
  ov: Overrides = {};
  private snapshot = '';

  readonly kinds = ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages', 'custom'] as const;

  constructor(private api: ApiService, private notify: NotifyService, private exporter: ExportService, private router: Router, private route: ActivatedRoute, public tour: TourService, private locale: LocaleService, readonly helpChat: HelpChatStore, private insights: InsightsApi, private featureApi: FeatureApi) {
    addIcons({ chatbubbleEllipsesOutline, closeOutline, shieldCheckmarkOutline });
  }

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    registerFlowIcons();
    this.helpChat.setContext('design');
    this.helpChat.setResume(this.id);
    this.helpChat.setDesignDoc(() => (this.step() === 3 ? this.ed?.doc() ?? null : null));
    void this.helpChat.load();
    this.sub = this.route.queryParamMap.subscribe((q) => { this.step.set(q.get('step') === 'export' ? 4 : 3); this.panel.set(null); this.viewMenu.set(false); this.shareOpen.set(false); });
  }
  ngOnDestroy() { this.sub?.unsubscribe(); this.helpChat.setContext(null); this.helpChat.clearResume(); }

  goStep(n: 3 | 4) { void this.router.navigate(['/resumes', this.id], { queryParams: n === 4 ? { step: 'export' } : {} }); }

  async continueToExport() {
    if (this.ed && !(await this.ed.flush())) return;
    if (this.isDirty() && this.name.trim()) {
      const ok = await new Promise<boolean>((resolve) => {
        this.saving.set(true);
        this.persist().subscribe({ next: (res) => { this.apply(res); this.saving.set(false); resolve(true); }, error: (e) => { this.failed(e); resolve(false); } });
      });
      if (!ok) return;
    }
    this.goStep(4);
  }

  ionViewWillEnter() {
    this.api.listTemplates().subscribe((t) => this.templates.set(t));
    this.api.getResume(this.id).subscribe({
      next: (res) => {
        if (!this.r() || !this.isDirty()) { this.apply(res); this.loadVersions(); }
        else this.r.update((cur) => (cur ? { ...cur, templateId: res.templateId, templateVersion: res.templateVersion, updatedAt: res.updatedAt } : cur));
      },
      error: (e) => this.error.set(e.status === 404 ? 'Resume not found.' : errorMessage(e)),
    });
  }

  private apply(res: Resume) {
    this.r.set(res); this.name = res.name; this.role = res.targetRole ?? ''; this.status = res.status;
    this.sections = res.sections.map((s) => ({ ...s })); this.ov = { ...res.overrides };
    this.snapshot = this.json();
  }
  private cleanOv(): Overrides {
    const o: Overrides = {};
    if (this.ov.accent) o.accent = this.ov.accent;
    if (this.ov.primaryColor) o.primaryColor = this.ov.primaryColor;
    if (this.ov.sectionSpacing) o.sectionSpacing = this.ov.sectionSpacing;
    if (this.ov.baseSizePt) o.baseSizePt = this.ov.baseSizePt;
    if (this.ov.pageSize) o.pageSize = this.ov.pageSize;
    return o;
  }
  private json() { return JSON.stringify({ n: this.name.trim(), r: this.role.trim(), s: this.status, sec: this.sections, o: this.cleanOv() }); }
  isDirty() { return !!this.r() && this.json() !== this.snapshot; }
  markDirty() { /* name change already tracked via json snapshot */ }

  label(t: string) { return SECTION_LABELS[t as keyof typeof SECTION_LABELS] ?? t; }
  tpl() { return this.templates().find((t) => t.id === this.r()?.templateId); }
  templateName() { return this.tpl()?.name ?? this.r()?.templateId ?? ''; }
  accent() { return this.ov.accent ?? this.tpl()?.theme?.accent ?? '#000000'; }
  templateSize() { return this.tpl()?.theme?.baseSizePt ?? 10.5; }
  onVeSaved(res: Resume) { if (this.isDirty()) this.r.set(res); else this.apply(res); }
  /** Rearrange lives in the main toolbar now (not inside the Sections tab). */
  rearrange() { this.ed?.openRearrange(); }
  /** Quality & ATS in the main toolbar opens the existing Quality & ATS panel (and loads the latest report). */
  openQuality() { this.openPanel('checks'); }
  addSec(kind: string) { this.ed?.addSec(kind); }
  resetToProfile() { this.ed?.resetToProfile(); }
  undo() { this.ed?.undo(); }
  redo() { this.ed?.redo(); }
  canUndo() { return this.ed?.canUndo() ?? false; }
  canRedo() { return this.ed?.canRedo() ?? false; }
  edScale() { return (this.ed?.scale() ?? 1) * 100; }
  zoom(d: number) { this.ed?.zoom(d); }
  setFit(m: 'width' | 'page') { this.ed?.setFit(m); }
  openPanel(p: 'sections' | 'design' | 'versions' | 'checks') {
    this.panel.set(p);
    if (p === 'checks') this.loadAts();
  }

  /** Hands the user to the assistant for a bounded sentence improvement of the resume. */
  openAssistantFix() { this.helpChat.open.set(true); void this.helpChat.improveResume(); }

  /** Reviewed chat design suggestions go through the visual editor's commit/autosave path. */
  applyDesign(patch: DesignPatch) { this.ed?.applyDesignPatch(patch); }
  openShare() { this.shareOpen.set(true); this.shareUrl.set(''); }

  async createShareLink() {
    if (!this.r()) return;
    this.sharing.set(true);
    this.api.createResumeShare(this.id).subscribe({
      next: (r) => { this.shareUrl.set(`${window.location.origin}${r.sharePath}`); this.sharing.set(false); },
      error: (e) => { this.sharing.set(false); void this.notify.toast(errorMessage(e), 'error'); },
    });
  }
  async copyShareLink() {
    try { await navigator.clipboard.writeText(this.shareUrl()); void this.notify.toast(this.locale.t('ed.shareCopied')); }
    catch { void this.notify.toast('Copy failed. Select the link text and copy it manually.', 'error'); }
  }
  async revokeShareLink() {
    if (!(await this.notify.confirm('Revoke link?', 'The link stops working immediately for everyone.', 'Revoke'))) return;
    this.api.revokeResumeShare(this.id).subscribe({
      next: () => { this.shareUrl.set(''); void this.notify.toast(this.locale.t('ed.shareRevoked')); this.shareOpen.set(false); },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  private persist() {
    return this.api.saveDraft(this.id, { name: this.name.trim(), targetRole: this.role.trim(), status: this.status, sections: this.sections, overrides: this.cleanOv() }, this.r()!.updatedAt);
  }
  private failed(e: { status?: number }) {
    this.saving.set(false);
    if (e.status === 409) { this.conflict.set(true); return; }
    void this.notify.toast(errorMessage(e), 'error');
  }
  reloadLatest() { this.conflict.set(false); this.api.getResume(this.id).subscribe((res) => { this.apply(res); this.loadVersions(); }); }

  save() {
    if (!this.name.trim()) return;
    this.saving.set(true); this.conflict.set(false);
    this.persist().subscribe({
      next: (res) => { this.apply(res); this.saving.set(false); void this.notify.toast('Resume saved'); },
      error: (e) => this.failed(e),
    });
  }

  private loadVersions() { this.api.listVersions(this.id).subscribe((v) => this.versions.set(v)); }
  saveVersion() {
    this.ed?.saveVersion();
  }

  /** Runs the deterministic quality check for this resume (score, mistakes, fixes). */
  runQuality() {
    const id = this.r()?.id;
    if (!id) return;
    this.qualityBusy.set(true);
    this.insights.runQuality(id).subscribe({
      next: (r) => { this.quality.set(r); this.qualityBusy.set(false); },
      error: (e) => { this.qualityBusy.set(false); },
    });
  }

  /** Loads the latest ATS corrections report for this resume (score, weak items, improvements). */
  loadAts() {
    const id = this.r()?.id;
    if (!id) return;
    this.featureApi.get<AtsReport[]>(`/resumes/${id}/ats-reports`)
      .then((rows) => (rows && rows[0] ? this.featureApi.get<AtsReport>(`/ats-reports/${rows[0].id}`) : Promise.resolve<AtsReport | null>(null)))
      .then((r: AtsReport | null) => this.ats.set(r))
      .catch(() => this.ats.set(null));
  }

  async preview() {
    if (this.ed && !(await this.ed.flush())) return;
    let blocked = false;
    if (this.isDirty() && this.name.trim()) await new Promise<void>((resolve) => {
      this.saving.set(true);
      this.persist().subscribe({ next: (res) => { this.apply(res); this.saving.set(false); resolve(); }, error: (e) => { this.failed(e); blocked = e.status === 409; resolve(); } });
    });
    if (blocked) return;
    void this.router.navigate(['/resumes', this.id, 'preview']);
  }

  async exp(format: 'pdf' | 'html' | 'docx' | 'xlsx') {
    this.exporting.set(true);
    await this.exporter.exportAndSave(this.id, this.name || 'resume', format);
    this.exporting.set(false);
  }
}