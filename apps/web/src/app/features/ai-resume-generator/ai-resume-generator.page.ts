import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  arrowBackOutline,
  briefcaseOutline,
  checkmarkCircleOutline,
  cloudUploadOutline,
  documentTextOutline,
  lockClosedOutline,
  refreshOutline,
  sparklesOutline,
} from 'ionicons/icons';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { CareerToolsApi } from '../../core/career-tools.api';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { SectionType } from '../../core/models';
import { errorMessage } from '../../core/notify.service';
import { AiResumeGeneratorApi, JdResumeGeneratorResult } from './ai-resume-generator.api';
import { buildTailoredDoc } from './tailored-doc';

interface GeneratedDocuments {
  resumeId: string;
  coverLetterId: string | null;
  templateName: string;
  targetRole: string;
  summary: string;
  letterError?: string;
}

/**
 * JD-driven resume + cover letter generator.
 *
 * Exactly two steps:
 *  1. Supply one job description (paste a single textarea, or upload a file).
 *  2. Both ATS-secure documents are ready, with direct links to edit each one.
 *
 * Template choice, section ordering and ATS layout are deterministic (server-side),
 * so there is no review/gallery step to slow the candidate down.
 */
@Component({
  selector: 'app-ai-resume-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, TranslatePipe],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ 'aiResume.hero.title' | t }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="page-shell ai-page">
        <a class="back-chip" routerLink="/dashboard" data-testid="ai-resume-back">
          <ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon>
          {{ 'nav.home' | t }}
        </a>

        <header class="hero">
          <div class="hero__body">
            <span class="hero__badge">
              <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
              {{ 'aiResume.atsBadge' | t }}
            </span>
            <h1>{{ 'aiResume.hero.title' | t }}</h1>
            <p class="hero__sub">{{ 'aiResume.hero.sub' | t }}</p>
            <ul class="hero__points">
              <li>
                <ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
                {{ 'aiResume.hero.point1' | t }}
              </li>
              <li>
                <ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
                {{ 'aiResume.hero.point2' | t }}
              </li>
              <li>
                <ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
                {{ 'aiResume.hero.point3' | t }}
              </li>
            </ul>
          </div>
          <div class="hero__art" aria-hidden="true">
            <div class="sheet"></div>
            <span class="sheet__spark"><ion-icon name="sparkles-outline"></ion-icon></span>
          </div>
        </header>

        <ol class="rail" [attr.aria-label]="'aiResume.stepsAria' | t">
          <li class="rail__step" [class.is-active]="step() === 1" [class.is-done]="step() === 2">
            <span class="rail__dot">
              @if (step() === 2) {
                <ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
              } @else {
                1
              }
            </span>
            <span class="rail__label">{{ 'aiResume.step.jd' | t }}</span>
          </li>
          <li class="rail__line" aria-hidden="true"></li>
          <li class="rail__step" [class.is-active]="step() === 2">
            <span class="rail__dot">
              @if (step() === 2) {
                <ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon>
              } @else {
                2
              }
            </span>
            <span class="rail__label">{{ 'aiResume.step.documents' | t }}</span>
          </li>
        </ol>

        @if (error()) {
          <div class="banner err" role="alert" data-testid="ai-resume-error">
            <ion-icon name="alert-circle-outline" aria-hidden="true"></ion-icon>
            <span>{{ error() }}</span>
          </div>
        }

        @if (profileMissing()) {
          <div class="banner warn" role="status" data-testid="ai-resume-needs-profile">
            <span>{{ 'aiResume.needProfile' | t }}</span>
            <a routerLink="/profile">{{ 'aiResume.goProfile' | t }}</a>
          </div>
        }

        <!-- STEP 1: single JD input, paste or upload -->
        @if (step() === 1) {
          <section class="work" aria-labelledby="step1-heading" data-testid="ai-resume-step1">
            <article class="panel">
              <header class="panel__head">
                <span class="panel__eyebrow" aria-hidden="true">01</span>
                <h2 id="step1-heading">{{ 'aiResume.step1.title' | t }}</h2>
                <p class="panel__desc">{{ 'aiResume.step1.desc' | t }}</p>
              </header>

              <div class="mode-row" role="group" [attr.aria-label]="'aiResume.inputModeAria' | t">
                <button
                  type="button"
                  class="chip"
                  [attr.aria-pressed]="inputMode() === 'paste'"
                  (click)="inputMode.set('paste')"
                >
                  <ion-icon name="document-text-outline" aria-hidden="true"></ion-icon>
                  {{ 'aiResume.pasteTab' | t }}
                </button>
                <button
                  type="button"
                  class="chip"
                  [attr.aria-pressed]="inputMode() === 'upload'"
                  (click)="inputMode.set('upload')"
                >
                  <ion-icon name="cloud-upload-outline" aria-hidden="true"></ion-icon>
                  {{ 'aiResume.uploadTab' | t }}
                </button>
              </div>

              @if (inputMode() === 'paste') {
                <div class="field">
                  <div class="field__top">
                    <label for="ai-jd-text">{{ 'aiResume.jdTextLabel' | t }}</label>
                    <span class="field__count">{{ 'aiResume.chars' | t: { n: jdText.length } }}</span>
                  </div>
                  <textarea
                    id="ai-jd-text"
                    data-testid="ai-resume-jd"
                    rows="11"
                    [(ngModel)]="jdText"
                    maxlength="30000"
                    [placeholder]="'aiResume.jdPlaceholder' | t"
                  ></textarea>
                  <span class="field__hint">{{ 'aiResume.step1.helper' | t }}</span>
                </div>
              } @else {
                <div
                  class="dropzone"
                  [class.is-dragging]="isDragging()"
                  [class.has-file]="!!selectedFile()"
                  data-testid="ai-resume-upload"
                  (dragover)="onDragOver($event)"
                  (dragleave)="isDragging.set(false)"
                  (drop)="onDrop($event)"
                >
                  <span class="dropzone__icon">
                    <ion-icon name="cloud-upload-outline" aria-hidden="true"></ion-icon>
                  </span>
                  <h3>{{ 'aiResume.dragDropTitle' | t }}</h3>
                  <p class="dropzone__sub">{{ 'aiResume.dragDropSub' | t }}</p>
                  <label class="btn ghost sm file-picker-label">
                    {{ 'aiResume.browseFiles' | t }}
                    <input
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      (change)="onFilePicked($event)"
                    />
                  </label>
                  @if (selectedFile()) {
                    <span class="file-chip" data-testid="ai-resume-file">
                      <ion-icon name="document-text-outline" aria-hidden="true"></ion-icon>
                      {{ 'aiResume.selectedFile' | t: { name: selectedFile()!.name } }}
                    </span>
                  }
                </div>
              }

              <div class="panel__foot">
                <button
                  class="btn generate-btn"
                  type="button"
                  data-testid="ai-resume-generate"
                  (click)="generate()"
                  [disabled]="!canGenerate()"
                >
                  @if (busy()) {
                    <ion-icon name="refresh-outline" class="spinning" aria-hidden="true"></ion-icon>
                    {{ 'aiResume.creating' | t }}
                  } @else {
                    <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
                    {{ 'aiResume.generateBtn' | t }}
                  }
                </button>
                <p class="panel__hint">{{ 'aiResume.generateHint' | t }}</p>
                <p class="hint panel__secure">
                  <ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon>
                  {{ 'aiResume.secureNote' | t }}
                </p>
              </div>
            </article>

            <aside class="side">
              <div class="side__card side__card--gain">
                <h2 class="side__title">{{ 'aiResume.side.title' | t }}</h2>
                <ul class="gain">
                  <li>
                    <span class="gain__icon"><ion-icon name="document-text-outline" aria-hidden="true"></ion-icon></span>
                    <p>{{ 'aiResume.side.resume' | t }}</p>
                  </li>
                  <li>
                    <span class="gain__icon"><ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon></span>
                    <p>{{ 'aiResume.side.letter' | t }}</p>
                  </li>
                  <li>
                    <span class="gain__icon gain__icon--ok"><ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon></span>
                    <p>{{ 'aiResume.side.facts' | t }}</p>
                  </li>
                </ul>
              </div>

              <div class="side__card side__card--privacy">
                <span class="side__lock"><ion-icon name="lock-closed-outline" aria-hidden="true"></ion-icon></span>
                <h3>{{ 'aiResume.side.privacyTitle' | t }}</h3>
                <p>{{ 'aiResume.side.privacy' | t }}</p>
              </div>
            </aside>
          </section>
        }

        <!-- STEP 2: both documents created -->
        @if (step() === 2 && generated(); as docs) {
          <section class="panel result" aria-labelledby="step2-heading" data-testid="ai-resume-step2">
            <header class="result__head">
              <span class="result__mark"><ion-icon name="checkmark-circle-outline" aria-hidden="true"></ion-icon></span>
              <div class="result__intro">
                <p class="result__eyebrow">{{ 'aiResume.result.eyebrow' | t }}</p>
                <h2 id="step2-heading">{{ 'aiResume.step2.title' | t }}</h2>
                <p class="result__desc">{{ 'aiResume.step2.desc' | t }}</p>
              </div>
            </header>

            <div class="docs">
              <article class="doc" data-testid="ai-resume-resume-card">
                <header class="doc__head">
                  <span class="doc__icon"><ion-icon name="document-text-outline" aria-hidden="true"></ion-icon></span>
                  <h3>{{ 'aiResume.resumeCard.title' | t }}</h3>
                </header>
                <div class="doc__meta">
                  <p>
                    <ion-icon name="document-text-outline" aria-hidden="true"></ion-icon>
                    {{ 'aiResume.templateApplied' | t: { name: docs.templateName } }}
                  </p>
                  <p>
                    <ion-icon name="briefcase-outline" aria-hidden="true"></ion-icon>
                    {{ 'aiResume.roleApplied' | t: { role: docs.targetRole } }}
                  </p>
                </div>
                <span class="pill pill--ok">{{ 'aiResume.atsStatus' | t }}</span>
                <a class="btn doc__action" [routerLink]="['/resumes', docs.resumeId]" data-testid="ai-resume-open-resume">
                  {{ 'aiResume.openResume' | t }}
                </a>
              </article>

              <article class="doc" data-testid="ai-resume-letter-card">
                <header class="doc__head">
                  <span class="doc__icon doc__icon--accent">
                    <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
                  </span>
                  <h3>{{ 'aiResume.letterCard.title' | t }}</h3>
                </header>
                @if (docs.coverLetterId) {
                  <p class="doc__sub">{{ 'aiResume.letterCard.sub' | t }}</p>
                  <span class="pill pill--ok">{{ 'aiResume.atsStatus' | t }}</span>
                  <a
                    class="btn ghost doc__action"
                    [routerLink]="['/cover-letters', docs.coverLetterId]"
                    data-testid="ai-resume-open-letter"
                  >
                    {{ 'aiResume.openLetter' | t }}
                  </a>
                } @else {
                  <p class="doc__sub">{{ 'aiResume.letterUnavailable' | t }}</p>
                }
              </article>
            </div>

            @if (docs.letterError) {
              <div class="banner warn" role="status" data-testid="ai-resume-letter-error">
                {{ 'aiResume.letterFailed' | t: { error: docs.letterError! } }}
              </div>
            }

            <div class="summary">
              <p class="summary__label">
                <ion-icon name="sparkles-outline" aria-hidden="true"></ion-icon>
                {{ 'aiResume.tailoredSummary' | t }}
              </p>
              <p class="summary__body">{{ docs.summary }}</p>
            </div>

            <div class="result__actions">
              <button class="btn ghost sm" type="button" (click)="back()">
                <ion-icon name="arrow-back-outline" aria-hidden="true"></ion-icon>
                {{ 'aiResume.editJd' | t }}
              </button>
              <button class="btn ghost sm" type="button" (click)="reset()">
                {{ 'aiResume.startOver' | t }}
              </button>
            </div>
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: [`
    .ai-page { gap: 1.15rem; }

    .back-chip {
      align-self: flex-start;
      display: inline-flex; align-items: center; gap: 0.35rem;
      min-height: 2.25rem; padding: 0.3rem 0.7rem;
      border-radius: 999px; border: 1px solid var(--c-border);
      background: var(--c-bg); color: var(--c-muted);
      font-size: 0.82rem; font-weight: 600; text-decoration: none;
    }

    /* ---------- hero ---------- */
    .hero {
      position: relative; overflow: hidden;
      display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
      gap: 1.5rem;
      padding: 1.9rem 1.75rem;
      border-radius: 20px;
      background:
        radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--c-accent) 32%, transparent), transparent 58%),
        radial-gradient(90% 120% at 0% 100%, color-mix(in srgb, #2b1668 45%, transparent), transparent 60%),
        var(--brand-gradient);
      color: #fff;
      box-shadow: 0 18px 44px color-mix(in srgb, var(--c-primary) 30%, transparent);
      isolation: isolate;
    }
    .hero__body { position: relative; z-index: 1; min-width: 0; }
    .hero__badge {
      display: inline-flex; align-items: center; gap: 0.4rem;
      padding: 0.3rem 0.7rem; border-radius: 999px;
      background: rgba(255, 255, 255, 0.18);
      border: 1px solid rgba(255, 255, 255, 0.35);
      backdrop-filter: blur(8px);
      font-size: 0.72rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
    }
    .hero h1 {
      margin: 0.65rem 0 0.4rem;
      font-size: clamp(1.55rem, 3.2vw, 2.15rem); line-height: 1.15; font-weight: 800;
      letter-spacing: -0.02em; color: #fff;
    }
    .hero__sub { margin: 0; max-width: 34rem; font-size: 0.95rem; line-height: 1.55; color: rgba(255, 255, 255, 0.92); }
    .hero__points { margin: 0.95rem 0 0; padding: 0; list-style: none; display: grid; gap: 0.3rem; }
    .hero__points li {
      display: flex; align-items: center; gap: 0.4rem;
      font-size: 0.8rem; font-weight: 600; color: rgba(255, 255, 255, 0.94);
    }
    .hero__points ion-icon { flex: none; font-size: 1rem; color: #d9ffe6; }

    .hero__art { position: relative; z-index: 1; display: grid; place-items: center; padding-right: 0.5rem; }
    /* Mock ATS page drawn with gradients so it costs almost no CSS. */
    .sheet {
      width: 8rem; height: 10rem; border-radius: 12px; transform: rotate(-4deg);
      background:
        linear-gradient(var(--c-primary), var(--c-primary)) 0.9rem 0.95rem / 2.3rem 0.4rem no-repeat,
        repeating-linear-gradient(#ded7f3 0 0.32rem, transparent 0.32rem 0.85rem) 0.9rem 1.9rem / 5.9rem 5.4rem no-repeat,
        rgba(255, 255, 255, 0.95);
      box-shadow: 0 16px 32px rgba(20, 10, 50, 0.28), inset 0 0 0 1px rgba(255, 255, 255, 0.6);
    }
    .sheet__spark {
      position: absolute; right: 0.1rem; bottom: 0.15rem;
      display: grid; place-items: center; width: 2.2rem; height: 2.2rem;
      border-radius: 12px; background: #fff; color: var(--c-primary); font-size: 1.15rem;
      box-shadow: 0 10px 20px rgba(20, 10, 50, 0.25);
    }

    /* ---------- step rail ---------- */
    .rail {
      list-style: none; margin: 0; padding: 0.55rem 0.85rem;
      display: flex; align-items: center; gap: 0.7rem;
      border: 1px solid var(--c-border); border-radius: 14px;
      background: var(--c-bg);
    }
    .rail__step { display: inline-flex; align-items: center; gap: 0.5rem; min-width: 0; }
    .rail__dot {
      flex: none; display: grid; place-items: center;
      width: 1.9rem; height: 1.9rem; border-radius: 999px;
      background: var(--c-surface); border: 1px solid var(--c-border);
      color: var(--c-muted); font-size: 0.8rem; font-weight: 800;
      transition: background 0.18s ease, color 0.18s ease, border-color 0.18s ease;
    }
    .rail__dot ion-icon { font-size: 1.1rem; }
    .rail__label { font-size: 0.85rem; font-weight: 700; color: var(--c-muted); white-space: nowrap; }
    .rail__step.is-active .rail__dot {
      background: var(--c-primary); border-color: var(--c-primary); color: var(--c-primary-text);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-primary) 18%, transparent);
    }
    .rail__step.is-active .rail__label { color: var(--c-text); }
    .rail__step.is-done .rail__dot {
      background: color-mix(in srgb, var(--c-ok) 18%, var(--c-bg));
      border-color: color-mix(in srgb, var(--c-ok) 55%, var(--c-border));
      color: var(--c-ok); box-shadow: none;
    }
    .rail__line { flex: 1; min-width: 1.25rem; height: 2px; border-radius: 999px; background: var(--c-border); }

    /* ---------- step 1 layout ---------- */
    .work { display: grid; grid-template-columns: minmax(0, 1fr) 19rem; gap: 1.1rem; align-items: start; }

    .panel {
      display: flex; flex-direction: column; gap: 1rem;
      padding: 1.35rem 1.25rem;
      background: var(--c-bg); border: 1px solid var(--c-border);
      border-radius: 18px;
      box-shadow: 0 1px 2px rgba(20, 10, 50, 0.04);
    }
    .panel__head { display: flex; flex-direction: column; gap: 0.3rem; }
    .panel__eyebrow {
      align-self: flex-start;
      font-size: 0.7rem; font-weight: 800; letter-spacing: 0.14em;
      color: color-mix(in srgb, var(--c-primary) 82%, var(--c-text));
    }
    .panel__head h2 { margin: 0; font-size: 1.2rem; font-weight: 800; letter-spacing: -0.01em; }
    .panel__desc { margin: 0; color: var(--c-muted); font-size: 0.88rem; line-height: 1.55; max-width: 40rem; }

    .mode-row { display: flex; flex-wrap: wrap; gap: 0.5rem; align-self: flex-start; }
    .mode-row .chip { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.85rem; font-weight: 600; }

    .field { display: flex; flex-direction: column; gap: 0.4rem; }
    .field__top { display: flex; align-items: baseline; justify-content: space-between; gap: 0.6rem; }
    .field__top label { font-size: 0.8rem; font-weight: 700; color: var(--c-text); }
    .field__count {
      font-size: 0.72rem; font-weight: 600; color: var(--c-muted);
      font-variant-numeric: tabular-nums;
    }
    .field textarea {
      width: 100%; resize: vertical; min-height: 13rem;
      line-height: 1.6; font-size: 0.9rem;
      border-radius: 14px; border: 1px solid var(--c-border);
      background: color-mix(in srgb, var(--c-surface) 30%, var(--c-bg));
      color: var(--c-text); padding: 0.85rem 0.95rem;
    }
    .field textarea:focus {
      outline: none; border-color: color-mix(in srgb, var(--c-primary) 65%, var(--c-border));
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-primary) 18%, transparent);
      background: var(--c-bg);
    }
    .field__hint { font-size: 0.74rem; color: var(--c-muted); }

    .dropzone {
      display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
      padding: 2.1rem 1.1rem; text-align: center;
      border: 2px dashed color-mix(in srgb, var(--c-border) 88%, var(--c-primary));
      border-radius: 16px;
      background:
        radial-gradient(80% 90% at 50% 0%, color-mix(in srgb, var(--c-primary) 7%, transparent), transparent 70%),
        color-mix(in srgb, var(--c-surface) 30%, var(--c-bg));
      cursor: pointer; transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
    }
    .dropzone:hover, .dropzone.is-dragging {
      border-color: var(--c-primary);
      background: color-mix(in srgb, var(--c-primary) 8%, var(--c-bg));
    }
    .dropzone.is-dragging { transform: scale(1.005); }
    .dropzone__icon {
      display: grid; place-items: center; width: 3.1rem; height: 3.1rem;
      border-radius: 999px; font-size: 1.5rem;
      background: color-mix(in srgb, var(--c-primary) 12%, var(--c-bg)); color: var(--c-primary);
    }
    .dropzone h3 { margin: 0; font-size: 1rem; font-weight: 700; }
    .dropzone__sub { margin: 0; max-width: 24rem; font-size: 0.8rem; line-height: 1.5; color: var(--c-muted); }
    .file-picker-label { position: relative; overflow: hidden; margin-top: 0.35rem; }
    .file-picker-label input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .file-chip {
      display: inline-flex; align-items: center; gap: 0.35rem;
      max-width: 100%; margin-top: 0.35rem; padding: 0.35rem 0.7rem;
      border-radius: 999px; border: 1px solid color-mix(in srgb, var(--c-ok) 45%, var(--c-border));
      background: color-mix(in srgb, var(--c-ok) 9%, var(--c-bg));
      font-size: 0.78rem; font-weight: 600;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .panel__foot {
      display: flex; flex-direction: column; gap: 0.45rem;
      padding-top: 0.9rem; border-top: 1px solid color-mix(in srgb, var(--c-border) 70%, transparent);
    }
    .generate-btn {
      align-self: flex-start; min-width: 16.5rem; min-height: 2.9rem;
      font-weight: 700; letter-spacing: 0.01em;
      box-shadow: 0 10px 22px color-mix(in srgb, var(--c-primary) 28%, transparent);
    }
    .generate-btn:disabled { box-shadow: none; }
    .panel__hint { margin: 0; font-size: 0.74rem; color: var(--c-muted); }
    .panel__secure { margin: 0; display: flex; align-items: flex-start; gap: 0.4rem; }
    .panel__secure ion-icon { flex: none; font-size: 0.95rem; margin-top: 0.1rem; }

    /* ---------- side column ---------- */
    .side { display: flex; flex-direction: column; gap: 0.9rem; }
    .side__card {
      padding: 1.1rem 1rem; border-radius: 18px;
      border: 1px solid var(--c-border); background: var(--c-bg);
    }
    .side__card--gain {
      background:
        radial-gradient(100% 80% at 100% 0%, color-mix(in srgb, var(--c-primary) 10%, transparent), transparent 65%),
        var(--c-bg);
    }
    .side__title { margin: 0 0 0.7rem; font-size: 0.78rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-muted); }
    .gain { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.8rem; }
    .gain li { display: flex; align-items: flex-start; gap: 0.6rem; }
    .gain__icon {
      flex: none; display: grid; place-items: center;
      width: 1.9rem; height: 1.9rem; border-radius: 10px; font-size: 1rem;
      background: color-mix(in srgb, var(--c-primary) 13%, var(--c-bg)); color: var(--c-primary);
    }
    .gain__icon--ok { background: color-mix(in srgb, var(--c-ok) 14%, var(--c-bg)); color: var(--c-ok); }
    .gain p { margin: 0.1rem 0 0; font-size: 0.82rem; line-height: 1.5; color: var(--c-text); }

    .side__card--privacy {
      display: flex; flex-direction: column; gap: 0.35rem; align-items: flex-start;
      background: color-mix(in srgb, var(--c-surface) 46%, var(--c-bg));
      border-style: dashed;
    }
    .side__lock {
      display: grid; place-items: center; width: 1.7rem; height: 1.7rem;
      border-radius: 999px; font-size: 0.95rem;
      background: color-mix(in srgb, var(--c-ok) 14%, var(--c-bg)); color: var(--c-ok);
    }
    .side__card--privacy h3 { margin: 0.15rem 0 0; font-size: 0.88rem; font-weight: 700; }
    .side__card--privacy p { margin: 0; font-size: 0.76rem; line-height: 1.55; color: var(--c-muted); }

    /* ---------- step 2 ---------- */
    .result { gap: 1.15rem; padding: 1.5rem 1.35rem; }
    .result__head { display: flex; align-items: flex-start; gap: 0.85rem; }
    .result__mark {
      flex: none; display: grid; place-items: center;
      width: 2.9rem; height: 2.9rem; border-radius: 14px; font-size: 1.6rem;
      background: color-mix(in srgb, var(--c-ok) 15%, var(--c-bg)); color: var(--c-ok);
    }
    .result__intro { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
    .result__eyebrow {
      margin: 0; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
      color: color-mix(in srgb, var(--c-ok) 80%, var(--c-text));
    }
    .result__intro h2 { margin: 0; font-size: 1.25rem; font-weight: 800; letter-spacing: -0.01em; }
    .result__desc { margin: 0.1rem 0 0; max-width: 42rem; font-size: 0.87rem; line-height: 1.55; color: var(--c-muted); }

    .docs { display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 0.9rem; }
    .doc {
      display: flex; flex-direction: column; gap: 0.65rem; align-items: flex-start;
      padding: 1.1rem 1rem; border-radius: 16px;
      border: 1px solid var(--c-border); background: var(--c-bg);
      transition: border-color 0.18s ease, box-shadow 0.18s ease;
    }
    .doc:hover { border-color: color-mix(in srgb, var(--c-primary) 45%, var(--c-border)); box-shadow: 0 10px 24px color-mix(in srgb, var(--c-primary) 12%, transparent); }
    .doc__head { display: flex; align-items: center; gap: 0.6rem; }
    .doc__head h3 { margin: 0; font-size: 1rem; font-weight: 800; }
    .doc__icon {
      display: grid; place-items: center; width: 2.2rem; height: 2.2rem;
      border-radius: 12px; font-size: 1.15rem;
      background: color-mix(in srgb, var(--c-primary) 13%, var(--c-bg)); color: var(--c-primary);
    }
    .doc__icon--accent { background: color-mix(in srgb, var(--c-accent) 18%, var(--c-bg)); color: color-mix(in srgb, var(--c-accent) 70%, var(--c-text)); }
    .doc__meta { display: flex; flex-direction: column; gap: 0.25rem; width: 100%; }
    .doc__meta p {
      margin: 0; display: flex; align-items: center; gap: 0.35rem;
      font-size: 0.78rem; line-height: 1.4; color: var(--c-muted);
    }
    .doc__meta ion-icon { flex: none; font-size: 0.9rem; color: color-mix(in srgb, var(--c-primary) 70%, var(--c-muted)); }
    .doc__sub { margin: 0; font-size: 0.82rem; line-height: 1.5; color: var(--c-muted); }
    .pill {
      display: inline-flex; align-items: center; gap: 0.3rem;
      padding: 0.22rem 0.6rem; border-radius: 999px;
      font-size: 0.7rem; font-weight: 800; letter-spacing: 0.02em;
    }
    .pill--ok { background: color-mix(in srgb, var(--c-ok) 12%, var(--c-bg)); color: color-mix(in srgb, var(--c-ok) 88%, var(--c-text)); border: 1px solid color-mix(in srgb, var(--c-ok) 35%, var(--c-border)); }
    .doc__action { width: 100%; margin-top: auto; }

    .summary {
      border-radius: 14px; padding: 0.9rem 1rem;
      border: 1px solid color-mix(in srgb, var(--c-primary) 30%, var(--c-border));
      background: color-mix(in srgb, var(--c-primary) 6%, var(--c-bg));
    }
    .summary__label {
      display: flex; align-items: center; gap: 0.35rem; margin: 0;
      font-size: 0.7rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase;
      color: color-mix(in srgb, var(--c-primary) 78%, var(--c-text));
    }
    .summary__label ion-icon { font-size: 0.95rem; }
    .summary__body { margin: 0.4rem 0 0; font-size: 0.88rem; line-height: 1.6; color: var(--c-text); }

    .result__actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.5rem; }

    .spinning { animation: spin 1s linear infinite; }
    @keyframes spin { 100% { transform: rotate(360deg); } }

    @media (max-width: 900px) {
      .work { grid-template-columns: minmax(0, 1fr); }
      .side { flex-direction: row; flex-wrap: wrap; }
      .side__card { flex: 1 1 16rem; }
    }
    @media (max-width: 700px) {
      .hero { grid-template-columns: minmax(0, 1fr); padding: 1.5rem 1.15rem; }
      .hero__art { display: none; }
      .panel { padding: 1.1rem 0.95rem; border-radius: 16px; }
      .rail { padding: 0.5rem 0.7rem; }
      .rail__label { font-size: 0.78rem; }
      .generate-btn { width: 100%; min-width: 0; }
      .result__head { flex-direction: column; }
      .result__actions { flex-direction: column; }
      .result__actions .btn { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .doc, .chip { transition: none; }
      .spinning { animation: none; }
    }
  `],
})
export class AiResumeGeneratorPage {
  private readonly api = inject(AiResumeGeneratorApi);
  private readonly coreApi = inject(ApiService);
  private readonly careerTools = inject(CareerToolsApi);
  private readonly router = inject(Router);

  step = signal<1 | 2>(1);
  inputMode = signal<'paste' | 'upload'>('paste');
  busy = signal(false);
  error = signal('');
  profileMissing = signal(false);
  isDragging = signal(false);
  selectedFile = signal<File | null>(null);
  jdText = '';
  analysis = signal<JdResumeGeneratorResult | null>(null);
  generated = signal<GeneratedDocuments | null>(null);

  constructor() {
    addIcons({
      alertCircleOutline,
      arrowBackOutline,
      briefcaseOutline,
      checkmarkCircleOutline,
      cloudUploadOutline,
      documentTextOutline,
      lockClosedOutline,
      refreshOutline,
      sparklesOutline,
    });
  }

  canGenerate(): boolean {
    if (this.busy()) return false;
    return this.inputMode() === 'upload' ? !!this.selectedFile() : this.jdText.trim().length >= 50;
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(true);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.selectedFile.set(file);
      if (this.inputMode() === 'upload') void this.generate({ navigateToResumeEditor: true });
    }
  }

  onFilePicked(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.selectedFile.set(file);
      // A picked file is an explicit intent: run generation straight away and open the editor.
      if (this.inputMode() === 'upload') void this.generate({ navigateToResumeEditor: true });
    }
    // Reset so picking the same file again still fires the change event.
    input.value = '';
  }

  /**
   * One action: analyze the JD, then commit both the resume and the matching cover letter.
   * When fired automatically right after a file was picked, it navigates straight into the
   * new resume's editor instead of showing the result step.
   */
  async generate(options?: { navigateToResumeEditor?: boolean }) {
    if (this.busy()) return;
    this.error.set('');
    this.profileMissing.set(false);
    const file = this.inputMode() === 'upload' ? this.selectedFile() : null;
    const jdText = this.jdText.trim();
    if (!file && jdText.length < 50) return;

    this.busy.set(true);
    try {
      try {
        await firstValueFrom(this.coreApi.getProfile());
      } catch (e) {
        if ((e as HttpErrorResponse).status === 404) {
          this.profileMissing.set(true);
          return;
        }
        throw e;
      }

      const analysis = await firstValueFrom(file ? this.api.analyzeUpload(file) : this.api.analyze({ jdText }));
      const docs = await this.createDocuments(analysis);
      this.analysis.set(analysis);
      this.generated.set(docs);
      if (options?.navigateToResumeEditor) {
        this.router.navigate(['/resumes', docs.resumeId]);
        return;
      }
      this.step.set(2);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  /** Creates an ATS-first resume with the tailored summary applied, plus its cover letter. */
  private async createDocuments(analysis: JdResumeGeneratorResult): Promise<GeneratedDocuments> {
    const role = (analysis.jdAnalysis.detectedTitle || '').trim() || 'Target Role';
    const safeRole = role.slice(0, 80);

    const resume = await firstValueFrom(this.coreApi.createResume({
      name: `${safeRole} (ATS)`,
      targetRole: safeRole,
      templateId: analysis.templateId,
    }));

    // Rebuild the document from the render model so the candidate's confirmed
    // experience/skills/education survive, swapping only the summary text.
    const model = await firstValueFrom(this.coreApi.renderModel(resume.id));
    await firstValueFrom(this.coreApi.updateResume(resume.id, {
      sections: analysis.suggestedSections.map((s) => ({ type: s.key as SectionType, visible: true })),
      overrides: { doc: buildTailoredDoc(model, analysis.summary) },
    }));

    let coverLetterId: string | null = null;
    let letterError: string | undefined;
    try {
      const letter = await firstValueFrom(this.careerTools.createDraft({
        title: `${safeRole} application`.slice(0, 120),
        jobTitle: safeRole,
        kind: 'standard',
        tone: 'professional',
        length: 'medium',
        resumeId: resume.id,
        jdText: analysis.jdText.slice(0, 20000),
      }));
      coverLetterId = letter.id;
    } catch (e) {
      letterError = errorMessage(e);
    }

    return {
      resumeId: resume.id,
      coverLetterId,
      templateName: analysis.templateName,
      targetRole: role,
      summary: analysis.summary,
      ...(letterError ? { letterError } : {}),
    };
  }

  back() {
    this.step.set(1);
  }

  reset() {
    this.step.set(1);
    this.inputMode.set('paste');
    this.error.set('');
    this.profileMissing.set(false);
    this.selectedFile.set(null);
    this.jdText = '';
    this.analysis.set(null);
    this.generated.set(null);
  }
}
