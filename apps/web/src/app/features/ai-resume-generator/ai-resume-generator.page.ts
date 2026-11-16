import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  sparklesOutline,
  documentTextOutline,
  cloudUploadOutline,
  checkmarkCircleOutline,
  refreshOutline,
  eyeOutline,
  downloadOutline,
  arrowBackOutline,
  layersOutline,
  createOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { errorMessage, NotifyService } from '../../core/notify.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TemplateLiveCardComponent } from '../../shared/template-live-card.component';
import {
  AiResumeGeneratorApi,
  JdResumeGeneratorResult,
} from './ai-resume-generator.api';
import { TemplateSummary } from '../../core/models';

@Component({
  selector: 'app-ai-resume-generator',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonIcon,
    TranslatePipe,
    TemplateLiveCardComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ 'aiResume.hero.title' | t }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="page-shell">
        <!-- Top Back button -->
        <a class="btn ghost sm" routerLink="/dashboard" style="align-self:flex-start">
          <ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon> {{ 'dash.title' | t }}
        </a>

        <!-- Hero Banner -->
        <div class="jd-hero">
          <div class="jd-hero-content">
            <div class="badge-pill">
              <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
              <span>ATS-Optimized &middot; High Voltage</span>
            </div>
            <h1>{{ 'aiResume.hero.title' | t }}</h1>
            <p>{{ 'aiResume.hero.sub' | t }}</p>
          </div>
        </div>

        <!-- Step Indicator -->
        <div class="steps-nav" role="tablist">
          <div class="step-item" [class.active]="step() === 1" [class.done]="step() > 1">
            <span class="step-num">1</span>
            <span class="step-label">{{ 'aiResume.step.jd' | t }}</span>
          </div>
          <div class="step-divider"></div>
          <div class="step-item" [class.active]="step() === 2" [class.done]="step() > 2">
            <span class="step-num">2</span>
            <span class="step-label">{{ 'aiResume.step.review' | t }}</span>
          </div>
          <div class="step-divider"></div>
          <div class="step-item" [class.active]="step() === 3" [class.done]="step() > 3">
            <span class="step-num">3</span>
            <span class="step-label">{{ 'aiResume.step.template' | t }}</span>
          </div>
          <div class="step-divider"></div>
          <div class="step-item" [class.active]="step() === 4">
            <span class="step-num">4</span>
            <span class="step-label">{{ 'aiResume.step.download' | t }}</span>
          </div>
        </div>

        @if (error()) {
          <div class="banner err" role="alert" data-testid="ai-resume-error">
            <ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon>
            <span>{{ error() }}</span>
          </div>
        }

        <!-- STEP 1: Job Description Intake -->
        @if (step() === 1) {
          <section class="card" aria-labelledby="step1-heading">
            <h2 id="step1-heading">1. {{ 'aiResume.step1.title' | t }}</h2>
            <p class="muted">{{ 'aiResume.step1.desc' | t }}</p>

            <div class="mode-toggle">
              <button
                class="chip"
                [attr.aria-pressed]="inputMode() === 'paste'"
                (click)="inputMode.set('paste')"
                type="button"
              >
                <ion-icon name="document-text-outline" aria-hidden="true"></ion-icon>
                {{ 'aiResume.pasteTab' | t }}
              </button>
              <button
                class="chip"
                [attr.aria-pressed]="inputMode() === 'upload'"
                (click)="inputMode.set('upload')"
                type="button"
              >
                <ion-icon name="cloud-upload-outline" aria-hidden="true"></ion-icon>
                {{ 'aiResume.uploadTab' | t }}
              </button>
            </div>

            @if (inputMode() === 'paste') {
              <div class="form-grid">
                <div class="field">
                  <label for="ai-job-title">{{ 'aiResume.jobTitleLabel' | t }}</label>
                  <input
                    id="ai-job-title"
                    [(ngModel)]="jobTitle"
                    maxlength="160"
                    placeholder="e.g. Senior Frontend Engineer"
                  />
                </div>
                <div class="field">
                  <label for="ai-company">{{ 'aiResume.companyLabel' | t }}</label>
                  <input
                    id="ai-company"
                    [(ngModel)]="company"
                    maxlength="120"
                    placeholder="e.g. Acme Corp"
                  />
                </div>
                <div class="field full">
                  <label for="ai-jd-text">{{ 'aiResume.jdTextLabel' | t }} *</label>
                  <textarea
                    id="ai-jd-text"
                    rows="8"
                    [(ngModel)]="jdText"
                    maxlength="30000"
                    placeholder="Paste the full job description here (skills, responsibilities, qualifications)..."
                  ></textarea>
                  <span class="hint">{{ jdText.length }} / 30000 characters</span>
                </div>
              </div>

              <div class="row" style="margin-top: 1rem;">
                <button
                  class="btn"
                  (click)="analyzePasted()"
                  [disabled]="busy() || jdText.trim().length < 50"
                >
                  @if (busy()) {
                    <ion-icon name="refresh-outline" class="spinning" aria-hidden="true"></ion-icon>
                    {{ 'aiResume.analyzing' | t }}
                  } @else {
                    <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
                    {{ 'aiResume.generateBtn' | t }}
                  }
                </button>
              </div>
            } @else {
              <div
                class="upload-zone"
                [class.drag-over]="isDragging()"
                (dragover)="onDragOver($event)"
                (dragleave)="isDragging.set(false)"
                (drop)="onDrop($event)"
              >
                <ion-icon name="cloud-upload-outline" class="upload-icon" aria-hidden="true"></ion-icon>
                <h3>{{ 'aiResume.dragDropTitle' | t }}</h3>
                <p class="muted">{{ 'aiResume.dragDropSub' | t }}</p>
                <label class="btn ghost sm file-picker-label">
                  <span>{{ 'aiResume.browseFiles' | t }}</span>
                  <input
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    (change)="onFilePicked($event)"
                    style="display:none;"
                  />
                </label>
                @if (selectedFile()) {
                  <div class="selected-file-chip">
                    <ion-icon name="document-text-outline" aria-hidden="true"></ion-icon>
                    <span>{{ selectedFile()!.name }} ({{ (selectedFile()!.size / 1024).toFixed(1) }} KB)</span>
                  </div>
                }
              </div>

              <div class="row" style="margin-top: 1rem;">
                <button
                  class="btn"
                  (click)="analyzeUploadedFile()"
                  [disabled]="busy() || !selectedFile()"
                >
                  @if (busy()) {
                    <ion-icon name="refresh-outline" class="spinning" aria-hidden="true"></ion-icon>
                    {{ 'aiResume.analyzing' | t }}
                  } @else {
                    <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
                    {{ 'aiResume.generateBtn' | t }}
                  }
                </button>
              </div>
            }
          </section>
        }

        <!-- STEP 2: Extraction Review -->
        @if (step() === 2 && result()) {
          <section class="card" aria-labelledby="step2-heading">
            <div class="row between">
              <h2 id="step2-heading">2. {{ 'aiResume.step2.title' | t }}</h2>
              <span class="badge ok">
                <ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
                Extracted
              </span>
            </div>
            <p class="muted">{{ 'aiResume.step2.desc' | t }}</p>

            <!-- Detected Meta Grid -->
            <div class="meta-preview-grid">
              <div class="meta-item">
                <span class="meta-label">Role Detected</span>
                <strong>{{ result()!.jdAnalysis.detectedTitle || jobTitle || 'General Technical Role' }}</strong>
              </div>
              <div class="meta-item">
                <span class="meta-label">Seniority</span>
                <span class="badge">{{ result()!.jdAnalysis.seniority || 'Mid / Not specified' }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Work Mode</span>
                <span class="badge">{{ result()!.jdAnalysis.workMode || 'Flexible / Onsite' }}</span>
              </div>
              <div class="meta-item">
                <span class="meta-label">Matched Skills</span>
                <strong class="stat-highlight">{{ result()!.matchedSkills.length }}</strong>
              </div>
            </div>

            <!-- Tailored Summary -->
            <div class="summary-box">
              <div class="row between">
                <span class="label"><strong>{{ 'aiResume.tailoredSummary' | t }}</strong></span>
                <span class="badge" [class.ok]="result()!.summarySource === 'ai'">
                  {{ result()!.summarySource === 'ai' ? 'AI Enhanced' : 'Standard' }}
                </span>
              </div>
              <p class="summary-text">{{ result()!.summary }}</p>
            </div>

            <!-- Matched Skills Chips -->
            <div>
              <span class="label" style="margin-bottom:0.5rem; display:block;">
                <strong>{{ 'aiResume.matchedSkills' | t }} ({{ result()!.matchedSkills.length }})</strong>
              </span>
              <div class="row wrap" style="gap:0.4rem;">
                @for (sk of result()!.matchedSkills; track sk) {
                  <span class="chip-skill">{{ sk }}</span>
                }
                @if (result()!.matchedSkills.length === 0) {
                  <span class="muted small">No exact skill overlaps with existing profile, but standard requirements mapped.</span>
                }
              </div>
            </div>

            <div class="row between" style="margin-top: 1.5rem;">
              <button class="btn ghost" (click)="step.set(1)">
                <ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon>
                {{ 'common.cancel' | t }}
              </button>
              <button class="btn" (click)="step.set(3)">
                {{ 'aiResume.nextTemplate' | t }}
                <ion-icon name="layers-outline" aria-hidden="true"></ion-icon>
              </button>
            </div>
          </section>
        }

        <!-- STEP 3: Auto-Selected Template & Gallery Switcher -->
        @if (step() === 3 && result()) {
          <section class="card" aria-labelledby="step3-heading">
            <div class="row between">
              <h2 id="step3-heading">3. {{ 'aiResume.step3.title' | t }}</h2>
              <span class="badge ok">
                <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
                High-Voltage Template Auto-Picked
              </span>
            </div>
            <p class="muted">{{ 'aiResume.step3.desc' | t }}</p>

            <!-- Current Chosen Template Card -->
            <div class="selected-template-highlight">
              <div class="tpl-info">
                <span class="badge">{{ selectedTemplate()?.category || 'ATS First' }}</span>
                <h3>{{ selectedTemplate()?.name }}</h3>
                <p class="muted small">{{ selectedTemplate()?.description }}</p>
                <div class="tags-row">
                  @for (tg of selectedTemplate()?.tags ?? []; track tg) {
                    <span class="tag-chip">#{{ tg }}</span>
                  }
                </div>
              </div>
              <button
                class="btn ghost sm"
                (click)="showGallery.set(!showGallery())"
                type="button"
              >
                <ion-icon name="layers-outline" aria-hidden="true"></ion-icon>
                {{ showGallery() ? ('aiResume.hideGallery' | t) : ('aiResume.changeTemplate' | t) }}
              </button>
            </div>

            <!-- Optional Template Gallery Grid -->
            @if (showGallery()) {
              <div class="gallery-wrapper">
                <h4>{{ 'aiResume.chooseAlternative' | t }}</h4>
                <div class="templates-grid">
                  @for (tpl of result()!.allTemplates; track tpl.id) {
                    <div
                      class="template-card"
                      [class.active]="selectedTemplateId() === tpl.id"
                      (click)="onSelectTemplate(tpl.id)"
                    >
                      <div class="tpl-thumb-container">
                        <app-template-live-card [template]="tpl"></app-template-live-card>
                      </div>
                      <div class="tpl-card-info">
                        <strong>{{ tpl.name }}</strong>
                        <span class="small muted">{{ tpl.category }}</span>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            <div class="row between" style="margin-top: 1.5rem;">
              <button class="btn ghost" (click)="step.set(2)">
                <ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon>
                {{ 'tour.back' | t }}
              </button>
              <button class="btn" (click)="proceedToDownload()">
                {{ 'aiResume.readyToDownload' | t }}
                <ion-icon name="download-outline" aria-hidden="true"></ion-icon>
              </button>
            </div>
          </section>
        }

        <!-- STEP 4: Download Ready in Seconds -->
        @if (step() === 4 && result()) {
          <section class="card download-card" aria-labelledby="step4-heading">
            <div class="success-icon-wrap">
              <ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
            </div>
            <h2 id="step4-heading">{{ 'aiResume.readyTitle' | t }}</h2>
            <p class="muted">{{ 'aiResume.readySub' | t }}</p>

            <div class="summary-specs">
              <div class="spec-row">
                <span class="muted">Template Applied:</span>
                <strong>{{ selectedTemplate()?.name }}</strong>
              </div>
              <div class="spec-row">
                <span class="muted">Target Role:</span>
                <strong>{{ result()!.jdAnalysis.detectedTitle || jobTitle || 'Target Role' }}</strong>
              </div>
              <div class="spec-row">
                <span class="muted">ATS Compliance:</span>
                <span class="badge ok">100% ATS-Friendly Layout</span>
              </div>
            </div>

            <div class="action-buttons-stack">
              <button class="btn" (click)="saveAsResumeDraft()" [disabled]="saving()">
                <ion-icon name="create-outline" aria-hidden="true"></ion-icon>
                {{ saving() ? 'Creating draft...' : ('aiResume.saveAndEdit' | t) }}
              </button>
              <a class="btn ghost" routerLink="/cover-letters" [queryParams]="{ jobTitle: jobTitle, company: company }">
                <ion-icon name="document-text-outline" aria-hidden="true"></ion-icon>
                {{ 'aiResume.generateCoverLetter' | t }}
              </a>
              <button class="btn ghost" (click)="reset()">
                {{ 'aiResume.startOver' | t }}
              </button>
            </div>
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .jd-hero {
      background: var(--brand-gradient);
      color: #fff;
      border-radius: var(--radius);
      padding: 2rem 1.5rem;
      margin-bottom: 1rem;
      box-shadow: 0 8px 24px rgba(124, 92, 255, 0.25);
    }
    .badge-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(8px);
      padding: 0.25rem 0.75rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
    }
    .jd-hero h1 {
      font-size: 1.8rem;
      font-weight: 800;
      margin-bottom: 0.4rem;
      color: #fff;
    }
    .jd-hero p {
      opacity: 0.92;
      font-size: 0.95rem;
      max-width: 36rem;
    }

    /* Steps */
    .steps-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 1rem;
      padding: 0.5rem 0;
    }
    .step-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--c-muted);
      font-weight: 600;
      font-size: 0.85rem;
    }
    .step-num {
      width: 1.8rem;
      height: 1.8rem;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      font-size: 0.8rem;
    }
    .step-item.active {
      color: var(--c-primary);
    }
    .step-item.active .step-num {
      background: var(--c-primary);
      color: #fff;
      border-color: var(--c-primary);
    }
    .step-item.done {
      color: var(--c-ok);
    }
    .step-item.done .step-num {
      background: var(--c-ok);
      color: #fff;
      border-color: var(--c-ok);
    }
    .step-divider {
      flex: 1;
      height: 2px;
      background: var(--c-border);
    }

    .mode-toggle {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .upload-zone {
      border: 2px dashed var(--c-border);
      border-radius: var(--radius);
      padding: 2.5rem 1rem;
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      background: var(--c-surface);
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
    }
    .upload-zone.drag-over {
      border-color: var(--c-primary);
      background: color-mix(in srgb, var(--c-primary) 8%, transparent);
    }
    .upload-icon {
      font-size: 3rem;
      color: var(--c-primary);
    }
    .selected-file-chip {
      margin-top: 0.75rem;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: var(--c-bg);
      border: 1px solid var(--c-border);
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
      font-size: 0.85rem;
      font-weight: 600;
    }

    /* Meta preview */
    .meta-preview-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      gap: 0.75rem;
      margin: 1rem 0;
    }
    .meta-item {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: 8px;
      padding: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .meta-label {
      font-size: 0.75rem;
      color: var(--c-muted);
      text-transform: uppercase;
      font-weight: 600;
    }
    .stat-highlight {
      font-size: 1.3rem;
      color: var(--c-primary);
    }

    .summary-box {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: 8px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .summary-text {
      margin-top: 0.5rem;
      font-size: 0.95rem;
      line-height: 1.6;
    }

    .chip-skill {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 500;
    }

    /* Selected template */
    .selected-template-highlight {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: var(--c-surface);
      border: 2px solid var(--c-primary);
      border-radius: var(--radius);
      padding: 1.25rem;
      margin: 1rem 0;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .tags-row {
      display: flex;
      gap: 0.35rem;
      flex-wrap: wrap;
      margin-top: 0.5rem;
    }
    .tag-chip {
      font-size: 0.75rem;
      color: var(--c-muted);
    }

    .gallery-wrapper {
      margin-top: 1rem;
      padding-top: 1rem;
      border-top: 1px solid var(--c-border);
    }
    .templates-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 1rem;
      margin-top: 0.75rem;
      max-height: 400px;
      overflow-y: auto;
      padding: 0.25rem;
    }
    .template-card {
      border: 2px solid var(--c-border);
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      background: var(--c-bg);
      transition: border-color 0.2s, transform 0.2s;
    }
    .template-card:hover {
      border-color: var(--c-primary);
      transform: translateY(-2px);
    }
    .template-card.active {
      border-color: var(--c-primary);
      box-shadow: 0 0 0 2px var(--c-primary);
    }
    .tpl-thumb-container {
      background: #fafafa;
      padding: 0.5rem;
      border-bottom: 1px solid var(--c-border);
    }
    .tpl-card-info {
      padding: 0.5rem;
      display: flex;
      flex-direction: column;
    }

    /* Step 4 */
    .download-card {
      text-align: center;
      align-items: center;
      padding: 2.5rem 1.5rem;
    }
    .success-icon-wrap {
      font-size: 3.5rem;
      color: var(--c-ok);
      margin-bottom: 0.5rem;
    }
    .summary-specs {
      background: var(--c-surface);
      border: 1px solid var(--c-border);
      border-radius: 8px;
      padding: 1rem;
      width: 100%;
      max-width: 28rem;
      margin: 1.5rem 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      text-align: left;
    }
    .spec-row {
      display: flex;
      justify-content: space-between;
    }
    .action-buttons-stack {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      width: 100%;
      max-width: 22rem;
    }

    .spinning {
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      100% { transform: rotate(360deg); }
    }
  `],
})
export class AiResumeGeneratorPage implements OnInit {
  step = signal<number>(1);
  inputMode = signal<'paste' | 'upload'>('paste');
  busy = signal<boolean>(false);
  error = signal<string>('');
  isDragging = signal<boolean>(false);
  showGallery = signal<boolean>(false);
  saving = signal<boolean>(false);

  jobTitle = '';
  company = '';
  jdText = '';
  selectedFile = signal<File | null>(null);

  result = signal<JdResumeGeneratorResult | null>(null);
  selectedTemplateId = signal<string>('');

  selectedTemplate = computed(() => {
    const res = this.result();
    if (!res) return null;
    return res.allTemplates.find((t) => t.id === this.selectedTemplateId()) ?? null;
  });

  constructor(
    private api: AiResumeGeneratorApi,
    private coreApi: ApiService,
    private notify: NotifyService,
    private router: Router,
  ) {
    addIcons({
      sparklesOutline,
      documentTextOutline,
      cloudUploadOutline,
      checkmarkCircleOutline,
      refreshOutline,
      eyeOutline,
      downloadOutline,
      arrowBackOutline,
      layersOutline,
      createOutline,
      alertCircleOutline,
    });
  }

  ngOnInit() {}

  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.isDragging.set(true);
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragging.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) this.selectedFile.set(file);
  }

  onFilePicked(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.selectedFile.set(file);
  }

  async analyzePasted() {
    this.error.set('');
    this.busy.set(true);
    try {
      const res = await firstValueFrom(
        this.api.analyze({
          jdText: this.jdText,
          jobTitle: this.jobTitle.trim() || undefined,
          company: this.company.trim() || undefined,
        })
      );
      this.result.set(res);
      this.selectedTemplateId.set(res.templateId);
      this.step.set(2);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async analyzeUploadedFile() {
    const file = this.selectedFile();
    if (!file) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const res = await firstValueFrom(
        this.api.analyzeUpload(file, this.jobTitle.trim() || undefined)
      );
      this.result.set(res);
      this.selectedTemplateId.set(res.templateId);
      this.step.set(2);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  onSelectTemplate(id: string) {
    this.selectedTemplateId.set(id);
    this.showGallery.set(false);
  }

  proceedToDownload() {
    this.step.set(4);
  }

  async saveAsResumeDraft() {
    const res = this.result();
    if (!res) return;
    this.saving.set(true);
    try {
      const title = res.jdAnalysis.detectedTitle || this.jobTitle || 'AI Resume';
      const resume = await firstValueFrom(
        this.coreApi.createResume({
          name: `${title} (ATS)`,
          templateId: this.selectedTemplateId() || res.templateId,
          targetRole: title,
        })
      );
      await this.notify.toast('Draft created successfully!');
      await this.router.navigate(['/resumes', resume.id]);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.saving.set(false);
    }
  }

  reset() {
    this.step.set(1);
    this.result.set(null);
    this.selectedFile.set(null);
    this.jdText = '';
    this.jobTitle = '';
    this.company = '';
    this.error.set('');
  }
}
