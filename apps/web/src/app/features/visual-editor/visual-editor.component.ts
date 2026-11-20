import { DatePipe, NgStyle } from '@angular/common';
import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, ViewChild, effect, untracked, computed, input, output, signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { ApiService } from '../../core/api.service';
import { DesignPatch } from '../../core/design-patch';
import { HelpChatStore } from '../../core/help-chat.api';
import { LocaleService } from '../../core/i18n/locale.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { RenderModel, Resume, ResumeVersion } from '../../core/models';
import { errorMessage, NotifyService } from '../../core/notify.service';
import { clamp, FitMode, fitScale, overflowWarning, pageCount } from '../../core/preview-layout';
import {
  DocImage, DocSection, DocSectionType, DOC_FONTS, ElementStyle, LOGO_RANGE, PHOTO_RANGE, RESUME_PALETTE, ResumeDoc, SIZE_RANGE, SPACE_RANGE,
} from '../../core/resume-doc';
import * as O from './doc.ops';
import { pinchScale, touchDistance, wheelScale } from './geometry';
import { History } from './history';
import { LoadedImage, loadImage, validateImageFile } from './image-process';
import { VeImageCropComponent } from './ve-image-crop.component';
import { VeRearrangeComponent } from './ve-rearrange.component';
import { sameTarget, Target, VeSheetComponent } from './ve-sheet.component';
import { registerVisualEditorIcons } from './visual-editor.icons';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';
const SECTION_KINDS: DocSectionType[] = ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages', 'custom'];

/**
 * Canva-style visual editor for Step 3 (Edit Template). Host it anywhere:
 *   <app-visual-editor [resume]="r()" (saved)="r.set($event)" />
 * It edits a document layer saved in `resume.overrides.doc` through the existing concurrency-checked draft endpoint
 * (autosave), and renders through the same render model the exports use. Call `flush()` before navigating to export/preview.
 */
@Component({
  selector: 'app-visual-editor',
  standalone: true,
  imports: [NgStyle, DatePipe, RouterLink, IonIcon, TranslatePipe, VeSheetComponent, VeImageCropComponent, VeRearrangeComponent],
  styleUrl: './visual-editor.component.scss',
  template: `
    <div class="ve" #root data-testid="visual-editor">
      @if (showBar()) {
      <div class="ve-bar" data-tour="ve-bar" role="toolbar" [attr.aria-label]="'ve.bar' | t">
        <button class="btn ghost sm icon" (click)="undo()" [disabled]="!canUndo()" [attr.aria-label]="'ve.undo' | t" [title]="'ve.undo' | t" data-testid="ve-undo"><ion-icon name="arrow-undo-outline" aria-hidden="true"></ion-icon></button>
        <button class="btn ghost sm icon" (click)="redo()" [disabled]="!canRedo()" [attr.aria-label]="'ve.redo' | t" [title]="'ve.redo' | t" data-testid="ve-redo"><ion-icon name="arrow-redo-outline" aria-hidden="true"></ion-icon></button>
        <span class="sep" aria-hidden="true"></span>
        <button class="btn ghost sm icon" (click)="zoom(-0.1)" [attr.aria-label]="'ve.zoomOut' | t" data-testid="ve-zoom-out"><ion-icon name="remove-outline" aria-hidden="true"></ion-icon></button>
        <span class="zoom" data-testid="ve-zoom" aria-live="polite">{{ (scale() * 100).toFixed(0) }}%</span>
        <button class="btn ghost sm icon" (click)="zoom(0.1)" [attr.aria-label]="'ve.zoomIn' | t" data-testid="ve-zoom-in"><ion-icon name="add-outline" aria-hidden="true"></ion-icon></button>
        <button class="btn ghost sm" (click)="setFit('width')" [attr.aria-pressed]="mode() === 'width'" data-testid="ve-fit-width">{{ 've.fitWidth' | t }}</button>
        <button class="btn ghost sm" (click)="setFit('page')" [attr.aria-pressed]="mode() === 'page'" data-testid="ve-fit-page">{{ 've.fitPage' | t }}</button>
        <span class="sep" aria-hidden="true"></span>
        <button class="btn ghost sm" (click)="outline.set(!outline())" [attr.aria-expanded]="outline()" aria-controls="ve-outline" data-testid="ve-outline-btn" data-tour="ve-outline-btn"><ion-icon [name]="showOutline() ? 'list-outline' : 'add-outline'" aria-hidden="true"></ion-icon> {{ (showOutline() ? 've.outline' : 've.addSection') | t }}</button>
        <button class="btn ghost sm" (click)="openRearrange()" [attr.aria-label]="'ve.rearrange' | t" data-testid="ve-rearrange-open"><ion-icon name="grid-outline" aria-hidden="true"></ion-icon> {{ 've.rearrange' | t }}</button>
        <span class="grow"></span>
        <span class="badge" [class.warn]="status() === 'dirty' || status() === 'saving'" [class.ok]="status() === 'saved'" [class.err]="status() === 'error' || status() === 'conflict'" role="status" data-testid="ve-status">{{ statusLabel() | t }}</span>
        <button class="btn ghost sm" (click)="toggleHistory()" [attr.aria-expanded]="historyOpen()" aria-controls="ve-history" data-testid="ve-history-btn"><ion-icon name="time-outline" aria-hidden="true"></ion-icon> {{ 've.history' | t }}</button>
        <button class="btn ghost sm" (click)="saveVersion()" [disabled]="!model()" data-testid="ve-save-version" data-tour="ve-save-version"><ion-icon name="save-outline" aria-hidden="true"></ion-icon> {{ 've.saveVersion' | t }}</button>
      </div>
      }

      @if (historyOpen()) {
        <section class="ve-history" id="ve-history" [attr.aria-label]="'ve.historyPanel' | t" data-testid="ve-history">
          <div class="row between">
            <h3>{{ 've.historyDetails' | t }}</h3>
            <button class="btn ghost sm icon" (click)="historyOpen.set(false)" [attr.aria-label]="'common.dismiss' | t" data-testid="ve-history-close"><ion-icon name="close-outline" aria-hidden="true"></ion-icon></button>
          </div>
          <p class="small muted">{{ 've.historyCurrent' | t }} · <span class="badge" [class.warn]="status() === 'dirty' || status() === 'saving'" [class.ok]="status() === 'saved'" [class.err]="status() === 'error' || status() === 'conflict'">{{ statusLabel() | t }}</span></p>
          @if (versionsLoading()) {
            <p class="muted small" data-testid="ve-history-loading">{{ 've.historyLoading' | t }}</p>
          } @else if (versions().length === 0) {
            <p class="muted small" data-testid="ve-history-empty">{{ 've.historyEmpty' | t }}</p>
          } @else {
            <ul class="history-list" data-testid="ve-history-list">
              @for (v of versions(); track v.id) {
                <li class="history-item" [attr.data-testid]="'ve-history-v-' + v.versionNumber">
                  <div class="row between"><strong>{{ 've.historyVersion' | t: { n: v.versionNumber } }}</strong><span class="muted small">{{ v.createdAt | date: 'medium' }}</span></div>
                  @if (v.changeSummary) { <p class="small">{{ v.changeSummary }}</p> }
                </li>
              }
            </ul>
          }
          <div class="row" style="margin-top: var(--space-2)">
            <button class="btn ghost sm" (click)="saveVersion()" [disabled]="!model()" data-testid="ve-history-save"><ion-icon name="save-outline" aria-hidden="true"></ion-icon> {{ 've.saveVersion' | t }}</button>
            <a class="btn ghost sm" [routerLink]="['/resumes', resume().id, 'versions']" data-testid="ve-history-open-page"><ion-icon name="open-outline" aria-hidden="true"></ion-icon> {{ 've.historyOpenPage' | t }}</a>
          </div>
        </section>
      }

      @if (status() === 'conflict') {
        <div class="banner warn" role="alert" data-testid="ve-conflict">{{ 've.conflict' | t }}
          <button class="btn ghost sm" (click)="reloadLatest()" data-testid="ve-reload">{{ 've.reload' | t }}</button></div>
      }
      @if (status() === 'error') {
        <div class="banner err" role="alert" data-testid="ve-error">{{ errorText() }} <button class="btn ghost sm" (click)="retry()">{{ 've.retry' | t }}</button></div>
      }
      @if (loadError()) { <div class="banner err" role="alert">{{ loadError() }}</div> }
      @if (warning(); as w) { <div class="banner warn" role="status" data-testid="ve-overflow">{{ 've.overflow' | t: { n: pages() } }}</div> }

      @if (outline()) {
        <section class="ve-outline" id="ve-outline" [attr.aria-label]="'ve.outline' | t" data-testid="ve-outline">
          <div class="row between"><h3>{{ 've.sections' | t }}</h3>
            <div class="row">
              <button class="btn ghost sm icon" (click)="openRearrange()" [attr.aria-label]="'ve.rearrange' | t" [title]="'ve.rearrange' | t" data-testid="ve-outline-rearrange"><ion-icon name="grid-outline" aria-hidden="true"></ion-icon></button>
              <button class="btn ghost sm icon" (click)="outline.set(false)" [attr.aria-label]="'common.dismiss' | t"><ion-icon name="close-outline" aria-hidden="true"></ion-icon></button>
            </div>
          </div>
          @if (showOutline()) {
          <ul class="list">
            @for (s of doc()?.sections ?? []; track s.id) {
              <li class="row" [attr.data-testid]="'ve-out-' + s.id" [class.dim]="s.hidden">
                <button class="btn ghost sm grow left" (click)="focusSection(s.id)">{{ s.title || ('ve.untitled' | t) }}</button>
                <button class="btn ghost sm icon" (click)="toggleHide(s.id)" [attr.aria-label]="(s.hidden ? 've.block.show' : 've.block.hide') | t" [attr.aria-pressed]="!!s.hidden"><ion-icon [name]="s.hidden ? 'eye-off-outline' : 'eye-outline'" aria-hidden="true"></ion-icon></button>
                <button class="btn ghost sm icon" (click)="removeSec(s.id)" [attr.aria-label]="'ve.block.delete' | t"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon></button>
              </li>
            }
          </ul>
          }
          <label class="small" for="ve-add-sec">{{ 've.addSection' | t }}</label>
          <div class="row">
            <select id="ve-add-sec" #addSel data-testid="ve-add-section-type">
              @for (k of kinds; track k) { <option [value]="k">{{ 've.type.' + k | t }}</option> }
            </select>
            <button class="btn sm" (click)="addSec(addSel.value)" data-testid="ve-add-section"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> {{ 've.add' | t }}</button>
          </div>
          <button class="btn ghost sm" (click)="resetToProfile()" data-testid="ve-reset-profile">{{ (confirmReset() ? 've.resetConfirm' : 've.resetProfile') | t }}</button>
        </section>
      }

      <div class="ve-viewport" #viewport (scroll)="queueReposition()" (wheel)="onWheel($event)" data-testid="ve-viewport" data-tour="ve-canvas">
        @if (model(); as m) {
          <div class="sheet-wrap" [style.width.px]="pageW() * scale()" [style.height.px]="sheetH() * scale()">
            <ve-sheet #sheet [model]="m" [selection]="sel()" [editing]="editing()" [scale]="scale()" [pages]="pages()"
                      (pick)="onPick($event)" (startEdit)="onStartEdit($event)" (commit)="onCommit($event)" (cancel)="onCancel()" (measured)="onMeasured($event)"></ve-sheet>
          </div>
        } @else if (!loadError()) { <p class="muted" style="padding:var(--space-4)">{{ 'common.loading' | t }}</p> }
      </div>

      @if (sel() && model()) {
        <div class="ve-tools" #tools role="toolbar" [attr.aria-label]="'ve.tools' | t" data-testid="ve-tools" [style.top.px]="pos()?.top" [style.left.px]="pos()?.left" [class.dragging]="!!drag()">
          <div class="tools-head">
            <span class="small muted">{{ selLabel() | t }}</span>
            <button class="btn ghost sm icon" (click)="clearSel()" [attr.aria-label]="'ve.deselect' | t" data-testid="ve-deselect"><ion-icon name="close-outline" aria-hidden="true"></ion-icon></button>
          </div>

          @if (textKey(); as k) {
            <div class="grp" role="group" [attr.aria-label]="'ve.fmt' | t">
              <button class="btn ghost sm icon" (click)="askAiFix()" [disabled]="helpChat.busy()" data-testid="ve-ai-fix" [attr.aria-label]="'chat.improveSentences' | t" [title]="'chat.improveSentences' | t">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor" stroke="none">
                  <path d="M12 2c.6 3.4 2.4 5.2 5.8 5.8-3.4.6-5.2 2.4-5.8 5.8-.6-3.4-2.4-5.2-5.8-5.8C9.6 7.2 11.4 5.4 12 2z" />
                  <path d="M18.5 16.5c.5 1.9 1.9 3.3 4.2 3.8-2.3.5-3.7 1.9 4.2 3.8-.5-1.9-1.9-3.3 4.2-3.8-2.3-.5-3.7-1.9-4.2-3.8z" opacity=".55" />
                </svg>
              </button>
              <select class="fmt-font" [value]="style(k).font ?? ''" (change)="setFont($any($event.target).value)" [attr.aria-label]="'ve.fmt.font' | t" data-testid="ve-font">
                <option value="">{{ 've.fmt.template' | t }}</option>
                @for (f of fonts; track f.id) { <option [value]="f.id">{{ f.id === 'Times-Roman' ? 'Times' : f.id }}</option> }
              </select>
              <button class="btn ghost sm icon" (click)="bumpSize(-1)" [disabled]="size(k) <= sizeMin" [attr.aria-label]="'ve.fmt.smaller' | t" data-testid="ve-size-down"><ion-icon name="remove-outline" aria-hidden="true"></ion-icon></button>
              <span class="val" data-testid="ve-size" [attr.aria-label]="'ve.fmt.size' | t">{{ size(k) }}</span>
              <button class="btn ghost sm icon" (click)="bumpSize(1)" [disabled]="size(k) >= sizeMax" [attr.aria-label]="'ve.fmt.larger' | t" data-testid="ve-size-up"><ion-icon name="add-outline" aria-hidden="true"></ion-icon></button>
              <button class="btn ghost sm icon fmt-b" (click)="toggle('bold')" [attr.aria-pressed]="isBold(k)" [attr.aria-label]="'ve.fmt.bold' | t" data-testid="ve-bold">B</button>
              <button class="btn ghost sm icon fmt-i" (click)="toggle('italic')" [attr.aria-pressed]="isItalic(k)" [attr.aria-label]="'ve.fmt.italic' | t" data-testid="ve-italic">I</button>
              <button class="btn ghost sm swatch-btn" (click)="colorOpen.set(!colorOpen())" [attr.aria-expanded]="colorOpen()" [attr.aria-label]="'ve.fmt.color' | t" data-testid="ve-color-btn">
                <span class="dot" [style.background]="currentColor(k)"></span></button>
              @for (a of aligns; track a) {
                <button class="btn ghost sm icon" (click)="setAlign(a)" [attr.aria-pressed]="align(k) === a" [attr.aria-label]="('ve.fmt.align.' + a) | t" [attr.data-testid]="'ve-align-' + a">
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                    @if (a === 'left') { <path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8" /> } @else if (a === 'center') { <path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8" /> } @else { <path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8" /> }
                  </svg></button>
              }
              <button class="btn ghost sm icon" (click)="bumpSpace(-2)" [attr.aria-label]="'ve.fmt.lessSpace' | t" data-testid="ve-space-down"><ion-icon name="remove-outline" aria-hidden="true"></ion-icon></button>
              <span class="val" [attr.aria-label]="'ve.fmt.space' | t" data-testid="ve-space" [title]="'ve.fmt.space' | t">↕ {{ space(k) }}</span>
              <button class="btn ghost sm icon" (click)="bumpSpace(2)" [attr.aria-label]="'ve.fmt.moreSpace' | t" data-testid="ve-space-up"><ion-icon name="add-outline" aria-hidden="true"></ion-icon></button>
              <button class="btn ghost sm icon" (click)="resetFmt()" [disabled]="!hasStyle(k)" [attr.aria-label]="'ve.fmt.reset' | t" [title]="'ve.fmt.reset' | t" data-testid="ve-fmt-reset"><ion-icon name="refresh-outline" aria-hidden="true"></ion-icon></button>
            </div>
            @if (colorOpen()) {
              <div class="grp colors" role="group" [attr.aria-label]="'ve.fmt.color' | t" data-testid="ve-colors">
                @for (tk of tokens; track tk) {
                  <button class="btn ghost sm tok" (click)="setColor(tk)" [attr.aria-pressed]="style(k).color === tk" [attr.data-testid]="'ve-color-' + tk"><span class="dot" [style.background]="tokenColor(tk)"></span> {{ ('ve.color.' + tk) | t }}</button>
                }
                @for (c of palette; track c) {
                  <button class="swatch" (click)="setColor(c)" [style.background]="c" [attr.aria-pressed]="style(k).color === c" [attr.aria-label]="c" [attr.data-testid]="'ve-color-' + c.slice(1)"></button>
                }
                <label class="small custom">{{ 've.fmt.custom' | t }} <input type="color" [value]="customColor(k)" (change)="setColor($any($event.target).value)" data-testid="ve-color-custom" /></label>
              </div>
            }
          }

          @if (imageKind(); as ik) {
            <div class="grp" role="group" [attr.aria-label]="'ve.image' | t">
              @if (imageSize() !== null) {
                <button class="btn ghost sm icon" (click)="bumpImage(-4)" [attr.aria-label]="'ve.image.smaller' | t" data-testid="ve-img-down"><ion-icon name="remove-outline" aria-hidden="true"></ion-icon></button>
                <span class="val" data-testid="ve-img-size">{{ imageSize() }}</span>
                <button class="btn ghost sm icon" (click)="bumpImage(4)" [attr.aria-label]="'ve.image.larger' | t" data-testid="ve-img-up"><ion-icon name="add-outline" aria-hidden="true"></ion-icon></button>
                <button class="btn ghost sm" (click)="pickFile(ik)" data-testid="ve-img-replace"><ion-icon name="image-outline" aria-hidden="true"></ion-icon> {{ 've.image.replace' | t }}</button>
                <button class="btn ghost sm" (click)="removeImage()" data-testid="ve-img-remove"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> {{ 've.image.remove' | t }}</button>
              } @else {
                <button class="btn sm" (click)="pickFile(ik)" data-testid="ve-img-add"><ion-icon name="image-outline" aria-hidden="true"></ion-icon> {{ (ik === 'photo' ? 've.photo.add' : 've.logo.add') | t }}</button>
              }
            </div>
          }

          @if (blockKind(); as bk) {
            <div class="grp" role="group" [attr.aria-label]="'ve.block' | t">
              <button class="btn ghost sm icon grip" (pointerdown)="startDrag($event)" (keydown)="gripKey($event)" [attr.aria-label]="'ve.block.drag' | t" [title]="'ve.block.drag' | t" data-testid="ve-grip"><ion-icon name="reorder-three-outline" aria-hidden="true"></ion-icon></button>
              @if (bk === 'item') {
                <button class="btn ghost sm icon" (click)="moveBlock(-1)" [disabled]="!canMove(-1)" [attr.aria-label]="'ve.block.up' | t" data-testid="ve-up"><ion-icon name="chevron-up-outline" aria-hidden="true"></ion-icon></button>
                <button class="btn ghost sm icon" (click)="moveBlock(1)" [disabled]="!canMove(1)" [attr.aria-label]="'ve.block.down' | t" data-testid="ve-down"><ion-icon name="chevron-down-outline" aria-hidden="true"></ion-icon></button>
              } @else {
                <button class="btn ghost sm icon" (click)="openRearrange()" [attr.aria-label]="'ve.rearrange' | t" [title]="'ve.rearrange' | t" data-testid="ve-rearrange-block"><ion-icon name="grid-outline" aria-hidden="true"></ion-icon></button>
              }
              <button class="btn ghost sm icon" (click)="duplicate()" [attr.aria-label]="'ve.block.duplicate' | t" data-testid="ve-duplicate"><ion-icon name="copy-outline" aria-hidden="true"></ion-icon></button>
              <button class="btn ghost sm icon" (click)="remove()" [attr.aria-label]="'ve.block.delete' | t" data-testid="ve-delete"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon></button>
              @if (bk === 'section') {
                <button class="btn ghost sm icon" (click)="toggleHide(sel()!.secId!)" [attr.aria-label]="'ve.block.hide' | t" data-testid="ve-hide"><ion-icon name="eye-off-outline" aria-hidden="true"></ion-icon></button>
                <button class="btn ghost sm icon" (click)="togglePageBreak()" [attr.aria-pressed]="!!sectionPageBreak()" [attr.aria-label]="'ve.block.pageBreak' | t" [title]="'ve.block.pageBreak' | t" data-testid="ve-page-break"><ion-icon name="document-outline" aria-hidden="true"></ion-icon></button>
              }
              @if (canAddItem()) { <button class="btn ghost sm" (click)="addItem()" data-testid="ve-add-item"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> {{ 've.addItem' | t }}</button> }
              @if (bk === 'item') {
                <button class="btn ghost sm" (click)="addBullet()" data-testid="ve-add-bullet"><ion-icon name="add-outline" aria-hidden="true"></ion-icon> {{ 've.addBullet' | t }}</button>
                @if (!itemHasImage()) { <button class="btn ghost sm" (click)="pickFile('item')" data-testid="ve-add-logo"><ion-icon name="image-outline" aria-hidden="true"></ion-icon> {{ 've.logo.add' | t }}</button> }
              }
              @if (sel()?.bullet !== undefined) {
                <button class="btn ghost sm" (click)="removeBulletSel()" data-testid="ve-remove-bullet"><ion-icon name="trash-outline" aria-hidden="true"></ion-icon> {{ 've.removeBullet' | t }}</button>
              }
            </div>
          }
          <p class="small muted hint">{{ (editing() ? 've.hint.editing' : 've.hint.select') | t }}</p>
        </div>
      }

      @if (drag(); as d) {
        <div class="drop-line" [style.top.px]="d.y" [style.left.px]="d.left" [style.width.px]="d.width" data-testid="ve-drop-line"></div>
      }

      @if (rearrange()) {
        <ve-rearrange [sections]="doc()?.sections ?? []" [layout]="layoutKind()" [sideSections]="sideTypes()" [focusId]="sel()?.secId ?? null"
                      (reordered)="onRearrange($event)" (closed)="rearrange.set(false)"></ve-rearrange>
      }

      <input #file type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" (change)="onFile($event)" data-testid="ve-file" />
      @if (crop(); as c) {
        <ve-image-crop [image]="c.img" [kind]="c.kind === 'photo' ? 'photo' : 'logo'" (done)="onCropDone($event)" (cancelled)="closeCrop()"></ve-image-crop>
      }
    </div>
  `,
})
export class VisualEditorComponent implements AfterViewInit, OnDestroy {
  resume = input.required<Resume>();
  /** Hosts that already show a Sections list (the edit page side panel) set this false: the editor then only offers Add section. */
  showOutline = input(true);
  /** The edit page renders one unified top bar: hide the in-canvas toolbar and drive undo/redo/zoom/panels from the host. */
  showBar = input(true);
  saved = output<Resume>();

  readonly kinds = SECTION_KINDS;
  readonly fonts = DOC_FONTS;
  readonly palette = RESUME_PALETTE;
  readonly tokens = ['accent', 'ink', 'muted', 'paper'] as const;
  readonly aligns = ['left', 'center', 'right'] as const;
  readonly sizeMin = SIZE_RANGE.min; readonly sizeMax = SIZE_RANGE.max;

  base = signal<RenderModel | null>(null);
  doc = signal<ResumeDoc | null>(null);
  sel = signal<Target | null>(null);
  editing = signal(false);
  status = signal<SaveState>('saved');
  loadError = signal('');
  errorText = signal('');
  outline = signal(false);
  rearrange = signal(false);
  colorOpen = signal(false);
  confirmReset = signal(false);
  historyOpen = signal(false);
  versions = signal<ResumeVersion[]>([]);
  versionsLoading = signal(false);
  mode = signal<FitMode>('width');
  manual = signal(1);
  scale = signal(1);
  contentH = signal(0);
  pos = signal<{ top: number; left: number } | null>(null);
  drag = signal<{ y: number; left: number; width: number } | null>(null);
  crop = signal<{ img: LoadedImage; kind: 'photo' | 'item'; target: Target } | null>(null);
  private rev = signal(0); // bumps on undo/redo so canUndo/canRedo recompute

  model = computed(() => { const b = this.base(); const d = this.doc(); return b && d ? O.applyDoc(b, d) : null; });
  pages = computed(() => pageCount(this.contentH(), this.model()?.page.size ?? 'A4'));
  warning = computed(() => overflowWarning(this.pages()));
  canUndo = computed(() => { this.rev(); this.doc(); return this.history.canUndo; });
  canRedo = computed(() => { this.rev(); this.doc(); return this.history.canRedo; });

  @ViewChild('viewport') viewport?: ElementRef<HTMLElement>;
  @ViewChild('sheet') sheet?: VeSheetComponent;
  @ViewChild('tools') tools?: ElementRef<HTMLElement>;
  @ViewChild('file') fileInput?: ElementRef<HTMLInputElement>;

  private history = new History<ResumeDoc>();
  private loadedKey = '';
  private updatedAt = '';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inflight = false;
  private sentDoc: ResumeDoc | null = null;
  private ro?: ResizeObserver;
  private fileFor: 'photo' | 'item' = 'photo';
  private pinch: { dist: number; scale: number } | null = null;
  private raf = 0;
  private resetTimer: ReturnType<typeof setTimeout> | undefined;
  private persistedDoc = false;

  constructor(private api: ApiService, private locale: LocaleService, private notify: NotifyService, private cdr: ChangeDetectorRef, readonly helpChat: HelpChatStore) {
    registerVisualEditorIcons();
    effect(() => {
      const r = this.resume();
      if (!this.inflight) this.updatedAt = r.updatedAt;
      untracked(() => this.adoptHostSections(r.sections)); // must not track doc(): only a host change should reconcile
      const key = `${r.id}|${r.templateId}|${r.templateVersion}`;
      if (key !== this.loadedKey) { this.loadedKey = key; this.load(r); }
    }, { allowSignalWrites: true });
    effect(() => { this.sel(); this.scale(); this.model(); this.colorOpen(); this.queueReposition(); });
  }

  ngAfterViewInit() {
    const vp = this.viewport?.nativeElement;
    if (!vp) return;
    if (typeof ResizeObserver !== 'undefined') { this.ro = new ResizeObserver(() => { this.refit(); this.queueReposition(); }); this.ro.observe(vp); }
    vp.addEventListener('touchstart', this.onTouchStart, { passive: true });
    vp.addEventListener('touchmove', this.onTouchMove, { passive: false });
    vp.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }
  ngOnDestroy() {
    this.ro?.disconnect(); clearTimeout(this.timer); clearTimeout(this.resetTimer); cancelAnimationFrame(this.raf);
    const vp = this.viewport?.nativeElement;
    vp?.removeEventListener('touchstart', this.onTouchStart); vp?.removeEventListener('touchmove', this.onTouchMove); vp?.removeEventListener('touchend', this.onTouchEnd);
    if (this.status() === 'dirty') void this.save(); // best effort: do not lose the last edits when the page is left
  }

  /* ---------- loading ---------- */
  private load(r: Resume) {
    this.api.renderModel(r.id).subscribe({
      next: (m) => {
        this.base.set(m);
        const persisted = r.overrides?.doc;
        this.persistedDoc = !!persisted;
        // Always initialize doc from persisted overrides on load.
        // The hasEdits check was preventing doc re-hydration from saved overrides
        // when undo history existed; undo/redo state is tracked separately.
        if (!this.doc()) this.doc.set(persisted ?? O.docFromModel(m));
        this.loadError.set('');
        setTimeout(() => this.refit());
      },
      error: (e) => this.loadError.set(e?.status === 404 ? this.locale.t('ve.notFound') : errorMessage(e)),
    });
  }
  reloadLatest() {
    this.api.getResume(this.resume().id).subscribe((res) => {
      this.history.clear(); this.status.set('saved'); this.updatedAt = res.updatedAt; this.doc.set(res.overrides?.doc ?? null);
      this.loadedKey = ''; this.saved.emit(res);
    });
  }

  /** The host's Sections panel changed order/visibility: mirror it into the document (no undo step) and save. */
  private adoptHostSections(cfg: Resume['sections']) {
    const d = this.doc(); if (!d || !cfg?.length) return;
    const next = O.reconcileDoc(d, cfg);
    if (next !== d) { this.doc.set(next); this.markDirty(); }
  }

  /* ---------- state changes ---------- */
  private commitDoc(next: ResumeDoc, coalesce = '') {
    const cur = this.doc(); if (!cur || next === cur) return;
    this.history.record(cur, coalesce);
    this.doc.set(O.pruneStyles(next));
    this.rev.update((n) => n + 1);
    this.markDirty();
  }
  /**
   * Applies a reviewed chat design patch through the same commit path as toolbar edits:
   * one undo step, style pruning, and the existing debounced, conflict-checked autosave.
   */
  applyDesignPatch(patch: DesignPatch): void {
    const original = this.doc();
    if (!original || !patch?.ops?.length) return;
    let next = original;
    for (const op of patch.ops) {
      if (op.kind === 'style') {
        for (const key of op.keys) {
          if (this.isDesignStyleKey(next, key)) next = O.setStyle(next, key, op.patch);
        }
      } else {
        const section = next.sections.find((s) => s.id === op.sectionId);
        if (section && !!section.pageBreakBefore !== op.value) next = O.togglePageBreak(next, section.id);
      }
    }
    if (next === original) return;
    this.commitDoc(next);
    this.sel.set(null);
    this.editing.set(false);
  }

  private isDesignStyleKey(doc: ResumeDoc, key: string): boolean {
    if (!/^(header\.(name|headline|contacts)|s\.[A-Za-z0-9_-]{1,40}\.(title|text)|i\.[A-Za-z0-9_-]{1,40}\.(title|subtitle|meta|text|bullets|tags|url))$/.test(key)) return false;
    if (key.startsWith('header.')) return true;
    const [kind, id] = key.split('.');
    return kind === 's' ? doc.sections.some((s) => s.id === id) : doc.sections.some((s) => s.items?.some((i) => i.id === id));
  }

  undo() { const cur = this.doc(); const p = cur && this.history.undo(cur); if (p) { this.doc.set(p); this.rev.update((n) => n + 1); this.sel.set(null); this.editing.set(false); this.markDirty(); } }
  redo() { const cur = this.doc(); const n = cur && this.history.redo(cur); if (n) { this.doc.set(n); this.rev.update((x) => x + 1); this.sel.set(null); this.editing.set(false); this.markDirty(); } }

  /* ---------- autosave (existing concurrency-checked draft endpoint) ---------- */
  private markDirty() {
    if (this.status() === 'conflict') return;
    this.status.set('dirty');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.save(), 1200);
  }
  retry() { void this.save(); }
  /** Saves now if there are unsaved edits. Resolves true when the server has the latest document. */
  async flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.status() === 'dirty' || this.status() === 'error') await this.save();
    return this.status() === 'saved';
  }
  private save(): Promise<void> {
    return new Promise<void>((resolve) => {
      const doc = this.doc(); const r = this.resume();
      if (!doc || this.status() === 'conflict') { resolve(); return; }
      if (this.inflight) { resolve(); return; }
      this.inflight = true; this.sentDoc = doc; this.status.set('saving');
      this.api.saveDraft(r.id, { overrides: { ...r.overrides, doc }, sections: O.cfgFromDoc(doc, r.sections ?? []) }, this.updatedAt).subscribe({
        next: (res) => {
          this.inflight = false; this.updatedAt = res.updatedAt; this.persistedDoc = true;
          this.saved.emit(res);
          if (this.doc() !== this.sentDoc) { this.status.set('dirty'); void this.save().then(resolve); return; }
          this.status.set('saved'); resolve();
        },
        error: (e: { status?: number }) => {
          this.inflight = false;
          if (e.status === 409) this.status.set('conflict');
          else { this.status.set('error'); this.errorText.set(errorMessage(e)); }
          resolve();
        },
      });
    });
  }
  statusLabel() { return ({ saved: 've.status.saved', dirty: 've.status.dirty', saving: 've.status.saving', error: 've.status.error', conflict: 've.status.conflict' } as const)[this.status()]; }

  async saveVersion() {
    if (!(await this.flush())) return;
    this.api.createVersion(this.resume().id, this.locale.t('ve.versionSummary')).subscribe({
      next: (v) => {
        void this.notify.toast(this.locale.t('ve.versionSaved'));
        if (this.historyOpen()) this.versions.update((vs) => [v, ...vs.filter((x) => x.id !== v.id)]);
      },
      error: (e) => void this.notify.toast(errorMessage(e), 'error'),
    });
  }

  toggleHistory() {
    const open = !this.historyOpen();
    this.historyOpen.set(open);
    if (open) { this.outline.set(false); this.loadVersions(); }
  }

  private loadVersions() {
    const r = this.resume();
    if (!r?.id) return;
    this.versionsLoading.set(true);
    this.api.listVersions(r.id).subscribe({
      next: (vs) => { this.versions.set(vs); this.versionsLoading.set(false); },
      error: () => { this.versions.set([]); this.versionsLoading.set(false); },
    });
  }
  resetToProfile() {
    if (!this.confirmReset()) { this.confirmReset.set(true); this.resetTimer = setTimeout(() => this.confirmReset.set(false), 4000); return; }
    this.confirmReset.set(false);
    const r = this.resume();
    this.api.saveDraft(r.id, { overrides: { ...r.overrides, doc: null } }, this.updatedAt).subscribe({
      next: (res) => {
        this.updatedAt = res.updatedAt; this.history.clear(); this.status.set('saved'); this.sel.set(null); this.persistedDoc = false;
        this.saved.emit(res); this.doc.set(null); this.loadedKey = '';
        this.api.renderModel(r.id).subscribe((m) => { this.base.set(m); this.doc.set(O.docFromModel(m)); });
      },
      error: (e: { status?: number }) => { if (e.status === 409) this.status.set('conflict'); else void this.notify.toast(errorMessage(e), 'error'); },
    });
  }

  /* ---------- zoom / fit / pinch ---------- */
  pageW() { return this.model() ? (this.model()!.page.size === 'LETTER' ? 816 : 794) : 794; }
  sheetH() { return Math.max(this.contentH(), this.model()?.page.size === 'LETTER' ? 1056 : 1123); }
  onMeasured(h: number) { if (h !== this.contentH()) { this.contentH.set(h); this.refit(); } }
  refit() {
    const v = this.viewport?.nativeElement; const m = this.model(); if (!v || !m) return;
    const next = fitScale(this.mode(), m.page.size, { w: v.clientWidth, h: v.clientHeight }, this.manual());
    if (Math.abs(next - this.scale()) > 0.004) this.scale.set(next); // ignore scrollbar-induced jitter (avoids resize/refit loops)
  }
  setFit(m: FitMode) { this.mode.set(m); this.refit(); }
  zoom(d: number) { this.manual.set(clamp(+(this.scale() + d).toFixed(2), 0.25, 2.5)); this.mode.set('manual'); this.refit(); }
  onWheel(e: WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault(); this.manual.set(wheelScale(this.scale(), e.deltaY)); this.mode.set('manual'); this.refit();
  }
  private onTouchStart = (e: TouchEvent) => { if (e.touches.length === 2) this.pinch = { dist: touchDistance(e.touches[0], e.touches[1]), scale: this.scale() }; };
  private onTouchMove = (e: TouchEvent) => {
    if (e.touches.length !== 2 || !this.pinch) return;
    e.preventDefault();
    this.manual.set(pinchScale(this.pinch.scale, this.pinch.dist, touchDistance(e.touches[0], e.touches[1]))); this.mode.set('manual'); this.refit();
  };
  private onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) this.pinch = null; };
  @HostListener('window:resize') onResize() { this.refit(); this.queueReposition(); }

  /* ---------- selection & editing ---------- */
  onPick(t: Target | null) {
    if (this.editing()) return;
    this.sel.set(t); this.colorOpen.set(false);
  }
  clearSel() { this.sel.set(null); this.editing.set(false); this.colorOpen.set(false); }
  onStartEdit(t: Target) {
    this.sel.set(t); this.editing.set(true);
    this.cdr.detectChanges(); this.sheet?.beginEditing(t);
  }
  onCancel() {
    this.editing.set(false);
    const t = this.sel(); const d = this.doc();
    if (t?.bullet !== undefined && d && t.secId && t.itemId && (O.findItem(d, t.secId, t.itemId)?.bullets?.[t.bullet] ?? 'x') === '') {
      this.commitDoc(O.removeBullet(d, t.secId, t.itemId, t.bullet)); this.sel.set({ kind: 'item', secId: t.secId, itemId: t.itemId });
    }
  }
  onCommit(e: { target: Target; text: string; enter: boolean }) {
    this.editing.set(false);
    const d = this.doc(); const t = e.target; if (!d || !t.el) return;
    let next: ResumeDoc = d;
    const parts = t.el.split('.');
    if (t.el === 'header.name') next = O.setHeaderText(d, 'name', e.text);
    else if (t.el === 'header.headline') next = O.setHeaderText(d, 'headline', e.text);
    else if (t.el === 'header.contacts') next = O.setContacts(d, e.text);
    else if (parts[0] === 's') next = parts[2] === 'title' ? O.setSectionTitle(d, parts[1], e.text) : O.setSectionText(d, parts[1], e.text);
    else if (parts[0] === 'i' && t.secId && t.itemId) {
      const f = parts[2];
      if (f === 'bullets' && t.bullet !== undefined) {
        if (e.text === '') next = O.removeBullet(d, t.secId, t.itemId, t.bullet);
        else {
          next = O.setBullet(d, t.secId, t.itemId, t.bullet, e.text);
          if (e.enter) next = O.insertBullet(next, t.secId, t.itemId, t.bullet);
        }
      } else if (f === 'tags') next = O.setTags(d, t.secId, t.itemId, e.text);
      else next = O.setItemText(d, t.secId, t.itemId, f as O.ItemTextField, e.text);
    }
    this.commitDoc(next);
    if (e.enter && t.bullet !== undefined && e.text !== '') { // Enter in a bullet: continue in a fresh bullet below
      const nt: Target = { ...t, bullet: t.bullet + 1 };
      this.sel.set(nt); this.editing.set(true); this.cdr.detectChanges(); this.sheet?.beginEditing(nt);
    } else if (e.enter) { this.cdr.detectChanges(); this.sheet?.focusTarget(t); }
  }

  /* ---------- context for the toolbar ---------- */
  textKey = computed(() => { const t = this.sel(); return t && O.isTextKey(t.el) ? t.el! : null; });
  imageKind = computed<'photo' | 'item' | null>(() => {
    const t = this.sel(); if (!t) return null;
    if (t.el === 'header.photo' || (t.kind === 'header' && !this.doc()?.header.photo)) return 'photo'; // header selected and no photo yet: offer Add photo
    if (t.el?.endsWith('.image')) return 'item';
    return null;
  });
  blockKind = computed<'section' | 'item' | null>(() => { const t = this.sel(); return t && t.kind !== 'header' ? (t.kind === 'item' ? 'item' : 'section') : null; });
  selLabel = computed(() => {
    const t = this.sel(); if (!t) return 've.sel.none';
    if (t.el) { const k = O.elementKind(t.el); return t.el.endsWith('.photo') ? 've.sel.photo' : t.el.endsWith('.image') ? 've.sel.logo' : `ve.sel.${k}`; }
    return t.kind === 'header' ? 've.sel.header' : t.kind === 'item' ? 've.sel.item' : 've.sel.section';
  });
  style(k: string): ElementStyle { return this.doc()?.styles[k] ?? {}; }
  hasStyle(k: string) { return Object.keys(this.style(k)).length > 0; }
  private defaults(k: string) { const m = this.model()!; return O.defaultsFor(k, m.theme as O.ThemeLike, !!m.theme.headerBand); }
  size(k: string) { return this.style(k).sizePt ?? this.defaults(k).sizePt; }
  isBold(k: string) { return this.style(k).bold ?? this.defaults(k).bold; }
  isItalic(k: string) { return this.style(k).italic ?? this.defaults(k).italic; }
  align(k: string) { return this.style(k).align ?? this.defaults(k).align; }
  space(k: string) { return this.style(k).spaceAfterPt ?? 0; }
  tokenColor(tk: string) { return O.resolveColor(tk, this.model()?.theme.accent ?? '#000000'); }
  currentColor(k: string) { return this.tokenColor(this.style(k).color ?? this.defaults(k).color) ?? this.style(k).color; }
  customColor(k: string) { const c = this.currentColor(k); return c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#000000'; }

  /* ---------- formatting ---------- */
  private fmt(patch: O.StylePatch, coalesce = '') {
    const k = this.textKey(); const d = this.doc(); if (!k || !d) return;
    this.commitDoc(O.setStyle(d, k, patch), coalesce);
  }
  setFont(v: string) { this.fmt({ font: (v || null) as ElementStyle['font'] | null }); }
  bumpSize(dir: 1 | -1) { const k = this.textKey()!; this.fmt({ sizePt: this.size(k) + dir }, `size:${k}`); }
  bumpSpace(delta: number) { const k = this.textKey()!; this.fmt({ spaceAfterPt: this.space(k) + delta }, `space:${k}`); }
  toggle(p: 'bold' | 'italic') { const k = this.textKey()!; this.fmt({ [p]: p === 'bold' ? !this.isBold(k) : !this.isItalic(k) }); }
  setAlign(a: 'left' | 'center' | 'right') { this.fmt({ align: a }); }
  setColor(c: string) { this.fmt({ color: c }); }
  resetFmt() { const k = this.textKey(), d = this.doc(); if (k && d) this.commitDoc(O.resetStyle(d, k)); }

  /** Opens the assistant for a bounded sentence improvement of the selected text (AI opt-in, deterministic fallback). */
  askAiFix(): void {
    const text = this.selectedText();
    if (!text.trim()) { void this.notify.toast(this.locale.t('ve.aiFixEmpty'), 'error'); return; }
    this.helpChat.startFix(text);
    this.helpChat.open.set(true);
  }

  /** The plain text of the currently selected element (toolbar assistant context). */
  selectedText(): string {
    const t = this.sel(); const d = this.doc(); if (!t || !d) return '';
    const el = t.el ?? '';
    if (el === 'header.name') return d.header.name ?? '';
    if (el === 'header.headline') return d.header.headline ?? '';
    const parts = el.split('.');
    if (parts[0] === 's' && t.secId) {
      const s = O.findSection(d, t.secId);
      const f = parts[2];
      if (f === 'title') return s?.title ?? '';
      if (f === 'text') return s?.text ?? '';
      return '';
    }
    if (parts[0] === 'i' && t.secId && t.itemId) {
      const it = O.findItem(d, t.secId, t.itemId);
      const f = parts[2];
      if (f === 'bullets') return t.bullet !== undefined ? (it?.bullets ?? [])[t.bullet] ?? '' : '';
      const v = f === 'title' ? it?.title : f === 'subtitle' ? it?.subtitle : f === 'meta' ? it?.meta : f === 'text' ? it?.text : f === 'url' ? it?.url : undefined;
      return typeof v === 'string' ? v : '';
    }
    return '';
  }

  /* ---------- block operations ---------- */
  private side() { return new Set(this.base()?.sideSections ?? []); }
  layoutKind = computed(() => this.base()?.layout ?? 'single-column');
  sideTypes = computed<string[]>(() => this.base()?.sideSections ?? []);
  openRearrange() { if (this.doc()) this.rearrange.set(true); }
  onRearrange(sections: DocSection[]) { const d = this.doc(); if (d) this.commitDoc({ ...d, sections }); }
  canMove(delta: -1 | 1): boolean {
    const t = this.sel(); const d = this.doc(); if (!t || !d) return false;
    if (t.kind === 'section') return O.neighbourIndex(d, t.secId!, delta, this.side()) >= 0;
    if (t.kind === 'item') {
      const items = O.findSection(d, t.secId!)?.items ?? []; const i = items.findIndex((x) => x.id === t.itemId);
      return i + delta >= 0 && i + delta < items.length;
    }
    return false;
  }
  moveBlock(delta: -1 | 1) {
    const t = this.sel(); const d = this.doc(); if (!t || !d) return;
    if (t.kind === 'section') this.commitDoc(O.moveSection(d, t.secId!, delta, this.side()));
    else if (t.kind === 'item') this.commitDoc(O.moveItem(d, t.secId!, t.itemId!, delta));
    this.keepInView();
  }
  toggleHide(id: string) { const d = this.doc(); if (!d) return; this.commitDoc(O.toggleSectionHidden(d, id)); if (this.sel()?.secId === id) this.sel.set(null); }
  sectionPageBreak() { const d = this.doc(); const id = this.sel()?.secId; return !!(id && d && O.findSection(d, id)?.pageBreakBefore); }
  togglePageBreak() { const d = this.doc(); const id = this.sel()?.secId; if (d && id) this.commitDoc(O.togglePageBreak(d, id)); }
  removeSec(id: string) { const d = this.doc(); if (!d) return; this.commitDoc(O.removeSection(d, id)); if (this.sel()?.secId === id) this.sel.set(null); }
  focusSection(id: string) {
    const d = this.doc(); const s = d && O.findSection(d, id); if (!s) return;
    if (s.hidden) this.commitDoc(O.toggleSectionHidden(d, id));
    this.cdr.detectChanges(); this.sel.set({ kind: 'section', secId: id }); this.keepInView();
  }
  addSec(kind: string) {
    const d = this.doc(); if (!d) return;
    const type = kind as DocSectionType;
    const title = type === 'custom' ? this.locale.t('ve.new.sectionTitle') : this.locale.t(`ve.type.${type}`);
    const afterId = this.sel()?.secId;
    const next = O.addSection(d, type, title, (k) => this.locale.t(k), afterId);
    if (next === d) { void this.notify.toast(this.locale.t('ve.limit'), 'error'); return; }
    this.commitDoc(next);
    const added = next.sections.find((s) => !d.sections.some((o) => o.id === s.id));
    if (added) { this.cdr.detectChanges(); this.sel.set({ kind: 'section', secId: added.id, el: O.K.sec(added.id, 'title') }); this.keepInView(); }
  }
  canAddItem() { const t = this.sel(); const d = this.doc(); const s = d && t?.secId ? O.findSection(d, t.secId) : null; return !!s && s.type !== 'summary' && (t?.kind === 'section' || t?.kind === 'item'); }
  addItem() {
    const t = this.sel(); const d = this.doc(); if (!t?.secId || !d) return;
    const r = O.addItem(d, t.secId, (k) => this.locale.t(k), t.itemId);
    if (r.doc === d) { void this.notify.toast(this.locale.t('ve.limit'), 'error'); return; }
    this.commitDoc(r.doc); this.cdr.detectChanges();
    this.sel.set({ kind: 'item', secId: t.secId, itemId: r.id }); this.keepInView();
  }
  addBullet() {
    const t = this.sel(); const d = this.doc(); if (!t?.secId || !t.itemId || !d) return;
    const item = O.findItem(d, t.secId, t.itemId); const at = (item?.bullets?.length ?? 0) - 1;
    this.commitDoc(O.insertBullet(d, t.secId, t.itemId, at, this.locale.t('ve.new.bullet'))); this.cdr.detectChanges();
    const nt: Target = { kind: 'item', secId: t.secId, itemId: t.itemId, el: O.K.item(t.itemId, 'bullets'), bullet: at + 1 };
    this.sel.set(nt); this.editing.set(true); this.cdr.detectChanges(); this.sheet?.beginEditing(nt);
  }
  removeBulletSel() {
    const t = this.sel(); const d = this.doc(); if (!t?.secId || !t.itemId || t.bullet === undefined || !d) return;
    this.commitDoc(O.removeBullet(d, t.secId, t.itemId, t.bullet)); this.sel.set({ kind: 'item', secId: t.secId, itemId: t.itemId });
  }
  duplicate() {
    const t = this.sel(); const d = this.doc(); if (!t || !d) return;
    if (t.kind === 'section') {
      const next = O.duplicateSection(d, t.secId!); if (next === d) { void this.notify.toast(this.locale.t('ve.limit'), 'error'); return; }
      this.commitDoc(next); const i = next.sections.findIndex((s) => s.id === t.secId);
      this.cdr.detectChanges(); this.sel.set({ kind: 'section', secId: next.sections[i + 1].id });
    } else if (t.kind === 'item') {
      const r = O.duplicateItem(d, t.secId!, t.itemId!); this.commitDoc(r.doc); this.cdr.detectChanges();
      this.sel.set({ kind: 'item', secId: t.secId, itemId: r.id });
    }
    this.keepInView();
  }
  remove() {
    const t = this.sel(); const d = this.doc(); if (!t || !d) return;
    if (t.kind === 'section') this.commitDoc(O.removeSection(d, t.secId!));
    else if (t.kind === 'item') this.commitDoc(O.removeItem(d, t.secId!, t.itemId!));
    this.sel.set(null);
  }
  itemHasImage() { const t = this.sel(); const d = this.doc(); return !!(t?.secId && t.itemId && d && O.findItem(d, t.secId, t.itemId)?.image); }

  /* ---------- images ---------- */
  pickFile(kind: 'photo' | 'item') { this.fileFor = kind; if (this.fileInput) { this.fileInput.nativeElement.value = ''; this.fileInput.nativeElement.click(); } }
  async onFile(ev: Event) {
    const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
    const v = validateImageFile(f);
    if (v !== 'ok') { void this.notify.toast(this.locale.t(v === 'type' ? 've.image.badType' : 've.image.tooBig'), 'error'); return; }
    const d = this.doc(); if (d && O.countImages(d) >= 24) { void this.notify.toast(this.locale.t('ve.limit'), 'error'); return; }
    try {
      const img = await loadImage(f);
      const t = this.sel() ?? { kind: 'header' as const };
      this.crop.set({ img, kind: this.fileFor, target: t });
    } catch { void this.notify.toast(this.locale.t('ve.image.unreadable'), 'error'); }
  }
  closeCrop() { const c = this.crop(); if (c) URL.revokeObjectURL(c.img.url); this.crop.set(null); }
  onCropDone(image: DocImage) {
    const c = this.crop(); const d = this.doc(); if (!c || !d) return;
    const t = c.target;
    if (c.kind === 'photo') { const keep = d.header.photo?.sizePt; this.commitDoc(O.setPhoto(d, { ...image, sizePt: keep ?? image.sizePt })); this.sel.set({ kind: 'header', el: 'header.photo' }); }
    else if (t.secId && t.itemId) {
      const keep = O.findItem(d, t.secId, t.itemId)?.image?.sizePt;
      this.commitDoc(O.setItemImage(d, t.secId, t.itemId, { ...image, sizePt: keep ?? image.sizePt }));
      this.sel.set({ kind: 'item', secId: t.secId, itemId: t.itemId, el: O.K.item(t.itemId, 'image') });
    }
    this.closeCrop();
  }
  imageSize(): number | null {
    const t = this.sel(); const d = this.doc(); if (!t || !d) return null;
    if (t.el === 'header.photo' || t.kind === 'header') return d.header.photo?.sizePt ?? null;
    if (t.el?.endsWith('.image') && t.secId && t.itemId) return O.findItem(d, t.secId, t.itemId)?.image?.sizePt ?? null;
    return null;
  }
  bumpImage(delta: number) {
    const t = this.sel(); const d = this.doc(); if (!t || !d) return;
    if (this.imageKind() === 'photo' && d.header.photo) this.commitDoc(O.setPhoto(d, { ...d.header.photo, sizePt: clamp(d.header.photo.sizePt + delta, PHOTO_RANGE.min, PHOTO_RANGE.max) }), 'imgsize');
    else if (t.secId && t.itemId) {
      const im = O.findItem(d, t.secId, t.itemId)?.image;
      if (im) this.commitDoc(O.setItemImage(d, t.secId, t.itemId, { ...im, sizePt: clamp(im.sizePt + delta, LOGO_RANGE.min, LOGO_RANGE.max) }), 'imgsize');
    }
  }
  removeImage() {
    const t = this.sel(); const d = this.doc(); if (!t || !d) return;
    if (this.imageKind() === 'photo') { this.commitDoc(O.setPhoto(d, undefined)); this.sel.set({ kind: 'header' }); }
    else if (t.secId && t.itemId) { this.commitDoc(O.setItemImage(d, t.secId, t.itemId, undefined)); this.sel.set({ kind: 'item', secId: t.secId, itemId: t.itemId }); }
  }

  /* ---------- drag to reorder (pointer events: mouse, pen and touch) ---------- */
  startDrag(e: PointerEvent) {
    const t = this.sel(); const sheet = this.sheet; if (!t || !sheet || t.kind === 'header') return;
    e.preventDefault();
    const grip = e.currentTarget as HTMLElement; grip.setPointerCapture(e.pointerId);
    const id = t.kind === 'item' ? t.itemId! : t.secId!;
    const sibs = sheet.siblings(t); const from = sibs.findIndex((s) => s.id === id); if (from < 0) return;
    let idx = from;
    const update = (cy: number) => {
      const rects = sibs.map((s) => s.el.getBoundingClientRect());
      idx = O.dropIndex(rects.map((r) => r.top + r.height / 2), cy);
      const col = sibs[0].el.parentElement!.getBoundingClientRect();
      const y = idx < rects.length ? rects[idx].top : rects[rects.length - 1].bottom;
      this.drag.set({ y, left: col.left, width: col.width });
    };
    const vp = this.viewport!.nativeElement;
    const move = (ev: PointerEvent) => {
      update(ev.clientY);
      const r = vp.getBoundingClientRect();
      if (ev.clientY < r.top + 48) vp.scrollBy({ top: -16 }); else if (ev.clientY > r.bottom - 48) vp.scrollBy({ top: 16 });
    };
    const end = (ev: PointerEvent, apply: boolean) => {
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', cancel);
      this.drag.set(null);
      const d = this.doc();
      if (apply && d && O.finalIndex(from, idx) !== from) {
        const beforeId = idx < sibs.length ? sibs[idx].id : null;
        this.commitDoc(t.kind === 'item' ? O.moveItemBefore(d, t.secId!, id, beforeId) : O.moveSectionBefore(d, id, beforeId));
        this.keepInView();
      }
      void ev;
    };
    const up = (ev: PointerEvent) => end(ev, true);
    const cancel = (ev: PointerEvent) => end(ev, false);
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', cancel);
    update(e.clientY);
  }
  gripKey(e: KeyboardEvent) {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); this.moveBlock(e.key === 'ArrowUp' ? -1 : 1); }
  }

  /* ---------- keyboard ---------- */
  @HostListener('document:keydown', ['$event']) onKey(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const mod = e.ctrlKey || e.metaKey;
    if (!this.model() || this.crop() || this.rearrange()) return;
    if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
    else if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); this.redo(); }
    else if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !el?.isContentEditable && this.blockKind()) { e.preventDefault(); this.moveBlock(e.key === 'ArrowUp' ? -1 : 1); }
    else if (e.key === 'Escape' && !typing && this.sel()) this.clearSel();
  }

  /* ---------- floating toolbar position ---------- */
  queueReposition() { cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(() => this.reposition()); }
  private reposition() {
    const t = this.sel(); const r = this.sheet?.rectOf(t); const tools = this.tools?.nativeElement; const vp = this.viewport?.nativeElement;
    if (!t || !r || !tools || !vp) { this.pos.set(null); return; }
    const v = vp.getBoundingClientRect(); const h = tools.offsetHeight; const w = tools.offsetWidth;
    let top = r.top - h - 8;
    if (top < v.top + 4) top = Math.min(r.bottom + 8, v.bottom - h - 4);
    top = Math.max(4, top);
    this.pos.set({ top, left: clamp(r.left, 8, Math.max(8, window.innerWidth - w - 8)) });
  }
  private keepInView() {
    setTimeout(() => { const t = this.sel(); const el = t ? (this.sheet?.elementFor(t) ?? this.sheet?.blockFor(t)) : null; el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); this.queueReposition(); }, 30);
  }
}
