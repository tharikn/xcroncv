import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { registerProfileToolIcons } from '../core/profile-tools.icons';
import { registerPlatformToolIcons } from '../core/platform-tools.icons';
import { registerReadinessToolIcons } from '../core/readiness-tools.icons';
import { registerParsingTestIcons } from '../features/parsing-test/parsing-test.icons';
import { registerAtsIcons } from '../features/ats-engine/ats-engine.icons';
import { addIcons } from 'ionicons';
import { arrowForwardOutline } from 'ionicons/icons';
import { IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';

interface Tool { path: string; title: string; text: string; icon: string; testid: string }

/** Hub for the optional career tools. One nav entry keeps the phone bottom bar uncluttered. */
@Component({
  selector: 'app-career-tools',
  standalone: true,
  imports: [IonContent, IonHeader, IonToolbar, IonTitle, IonIcon, RouterLink],
  template: `
    <ion-header><ion-toolbar><ion-title>Career tools</ion-title></ion-toolbar></ion-header>
    <ion-content>
      <div class="page-shell">
        <div class="page-head"><div><h1>Career tools</h1><p>Beyond the resume: letters, contacts and a clear view of your search.</p></div></div>
        <ul class="tool-grid" data-testid="tools-grid">
          @for (t of tools; track t.path) {
            <li>
              <a class="tool-card" [routerLink]="t.path" [attr.data-testid]="t.testid" [attr.aria-label]="'Open ' + t.title">
                <span class="tool-icon" aria-hidden="true"><ion-icon [name]="t.icon"></ion-icon></span>
                <span class="tool-title">{{ t.title }}</span>
                <span class="tool-text">{{ t.text }}</span>
                <span class="tool-go" aria-hidden="true">Open <ion-icon name="arrow-forward-outline"></ion-icon></span>
              </a>
            </li>
          }
        </ul>
      </div>
    </ion-content>
  `,
  styles: [`
    .tool-grid { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); }
    .tool-grid li { display: flex; }
    .tool-card { position: relative; display: flex; flex-direction: column; gap: var(--space-2); width: 100%; padding: var(--space-4); border-radius: 16px; background: var(--c-bg); border: 1px solid var(--c-border); color: inherit; text-decoration: none; overflow: hidden; transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
    .tool-card::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 4px; background: var(--brand-gradient); opacity: 0; transition: opacity .15s ease; }
    .tool-card:hover, .tool-card:focus-visible { transform: translateY(-3px); border-color: #7c5cff; box-shadow: 0 12px 28px rgba(124, 92, 255, 0.18); }
    .tool-card:hover::before, .tool-card:focus-visible::before { opacity: 1; }
    .tool-icon { display: grid; place-items: center; width: 4rem; height: 4rem; border-radius: 16px; background: var(--brand-gradient); color: #fff; box-shadow: 0 8px 18px rgba(124, 92, 255, 0.28); margin-bottom: var(--space-2); }
    .tool-icon ion-icon { font-size: 2.1rem; }
    .tool-title { font-size: 1.1rem; font-weight: 700; line-height: 1.25; }
    .tool-text { color: var(--c-muted, #5b6270); font-size: .9rem; line-height: 1.45; flex: 1; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
    .tool-go { display: inline-flex; align-items: center; gap: .35rem; margin-top: var(--space-2); font-weight: 700; color: #7c5cff; }
    .tool-go ion-icon { transition: transform .15s ease; }
    .tool-card:hover .tool-go ion-icon { transform: translateX(3px); }
    @media (prefers-reduced-motion: reduce) { .tool-card, .tool-go ion-icon { transition: none; } .tool-card:hover { transform: none; } }
  `],
})
export class CareerToolsPage {
  constructor() { addIcons({ arrowForwardOutline }); registerProfileToolIcons(); registerPlatformToolIcons(); registerReadinessToolIcons(); registerParsingTestIcons(); registerAtsIcons(); }
  tools: Tool[] = [
    { path: '/career-imports', title: 'Import career data', text: 'Stage details from PDF, DOCX, JSON or CSV files, review every field, and merge only what you approve. Undo any time.', icon: 'cloud-upload-outline', testid: 'tool-career-imports' },
    { path: '/career-facts', title: 'Achievement bank', text: 'Write each achievement once, confirm it, and reuse it. Numbers stay unconfirmed until you say so.', icon: 'ribbon-outline', testid: 'tool-career-facts' },
    { path: '/evidence-check', title: 'Evidence check', text: 'See which resume statements are backed by facts you confirmed, and review rewrites before keeping them.', icon: 'scan-outline', testid: 'tool-evidence-check' },
    { path: '/ats', title: 'ATS score', text: 'An explained ATS compatibility estimate for one resume and one job posting. Fixed rules, no AI score; separate from job match.', icon: 'speedometer-outline', testid: 'tool-ats' },
    { path: '/parsing-test', title: 'Parsing test', text: 'See whether software can read your exported PDF or DOCX. Test parsers only; no ATS claims.', icon: 'scan-outline', testid: 'tool-parsing-test' },
    { path: '/cover-letters', title: 'Cover letters', text: 'Role-specific drafts from your confirmed experience, with every claim checked.', icon: 'mail-outline', testid: 'tool-cover-letters' },
    { path: '/contacts', title: 'Contacts', text: 'Recruiters, referrers and follow-up reminders, private to you.', icon: 'people-outline', testid: 'tool-contacts' },
    { path: '/job-analytics', title: 'Job search analytics', text: 'Funnels and response times from your own activity, with sample sizes shown.', icon: 'stats-chart-outline', testid: 'tool-analytics' },
    { path: '/portfolio', title: 'Portfolio', text: 'Publish a private-by-default page with only the fields you pick; expire or revoke any time.', icon: 'globe-outline', testid: 'tool-portfolio' },
    { path: '/autofill', title: 'Autofill assistant', text: 'Review confirmed profile facts and copy them into an application. Never submits for you.', icon: 'create-outline', testid: 'tool-autofill' },
    { path: '/wallet', title: 'Evidence wallet', text: 'Credential details and proof references with honest verification status. No files stored.', icon: 'ribbon-outline', testid: 'tool-wallet' },
    { path: '/application-vault', title: 'Application vault', text: 'Which saved resume version went to which employer. A private record; no files stored.', icon: 'archive-outline', testid: 'tool-vault' },
    { path: '/readiness', title: 'Career readiness', text: 'Compare a target role with your recorded evidence and plan next steps. No score.', icon: 'trending-up-outline', testid: 'tool-readiness' },
    { path: '/interview-prep', title: 'Interview preparation', text: 'Practice questions quoted from your resume, with text-only feedback on your answers.', icon: 'chatbubbles-outline', testid: 'tool-interview' },
    { path: '/feedback-shares', title: 'Feedback and sharing', text: 'Share one resume version with one reviewer, on your terms. Expires; revoke any time.', icon: 'share-social-outline', testid: 'tool-feedback' },
    { path: '/ai', title: 'AI assistant', text: 'Optional, opt-in wording help. Suggestions only, always reviewed by you; never touches a score.', icon: 'sparkles-outline', testid: 'tool-ai' },
    { path: '/integrations', title: 'Integrations', text: 'Signed webhooks to your own HTTPS endpoint with a delivery log. Ids only, never resume content.', icon: 'link-outline', testid: 'tool-integrations' },
    { path: '/career-path', title: 'Career path', text: 'Explainable next-role options from your confirmed profile, plus a plan you edit. Pay shown only from licensed sources.', icon: 'trending-up-outline', testid: 'tool-career-path' },
    { path: '/clips', title: 'Job clipper', text: 'Save a job by pasting it or with the optional extension. You review every field before anything is stored.', icon: 'cloud-download-outline', testid: 'tool-clips' },
    { path: '/portal-jobs', title: 'Portal jobs', text: 'Jobs from a portal, evidence-based tailoring suggestions, and the exact resume version you used. No auto-apply.', icon: 'briefcase-outline', testid: 'tool-portal-jobs' },
    { path: '/interview-copilot', title: 'Interview copilot', text: 'Text practice with questions from a saved resume version. Feedback on answers only; kept only if you opt in.', icon: 'mic-outline', testid: 'tool-copilot' },
    { path: '/documents', title: 'Career documents', text: 'Bios, reference requests, thank-you notes and letters from your confirmed facts, with evidence labels and versions.', icon: 'documents-outline', testid: 'tool-documents' },
    { path: '/expert-review', title: 'Expert review', text: 'Ask a reviewer about one saved resume version, on your terms. Scoped, expiring, revocable; payment not configured.', icon: 'bag-check-outline', testid: 'tool-expert-review' },
  ];
}
