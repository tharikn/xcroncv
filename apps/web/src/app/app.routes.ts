import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage), title: 'Sign in - XCron CV' },
  { path: 'auth/callback', loadComponent: () => import('./pages/auth-callback.page').then((m) => m.AuthCallbackPage), title: 'Signing in - XCron CV' },
  // Doc 41: anonymous, token-addressed portfolio view. Deliberately no authGuard and outside the shell.
  { path: 'p/:token', loadComponent: () => import('./pages/public-portfolio.page').then((m) => m.PublicPortfolioPage), title: 'Portfolio' },
  {
    // Preview is a dedicated route (doc 17): not inside the dashboard shell.
    path: 'resumes/:id/preview', canActivate: [authGuard],
    loadComponent: () => import('./pages/preview.page').then((m) => m.PreviewPage), title: 'Preview - XCron CV',
  },
  {
    // Recruiter View (doc 22): dedicated read-only route, outside the shell like Preview.
    path: 'recruiter-view/:id', canActivate: [authGuard],
    loadComponent: () => import('./pages/recruiter-view.page').then((m) => m.RecruiterViewPage), title: 'Recruiter view - XCron CV',
  },
  {
    path: '', canActivate: [authGuard],
    loadComponent: () => import('./shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./pages/dashboard.page').then((m) => m.DashboardPage), title: 'Dashboard - XCron CV' },
      { path: 'ai-resume-generator', loadComponent: () => import('./features/ai-resume-generator/ai-resume-generator.page').then((m) => m.AiResumeGeneratorPage), title: 'AI Resume Generator - XCron CV' },
      { path: 'profile', loadComponent: () => import('./pages/profile.page').then((m) => m.ProfilePage), title: 'Career profile - XCron CV' },
      { path: 'resumes', loadComponent: () => import('./pages/resumes.page').then((m) => m.ResumesPage), title: 'My resumes - XCron CV' },
      // Step 3 visual editor (doc 16): click-to-edit page with drag/touch reorder, images and formatting.
      { path: 'resumes/:id/design', loadComponent: () => import('./features/visual-editor/visual-editor.page').then((m) => m.VisualEditorPage), title: 'Visual editor - XCron CV' },
      { path: 'resumes/:id', loadComponent: () => import('./pages/resume-editor.page').then((m) => m.ResumeEditorPage), title: 'Editor - XCron CV' },
      { path: 'import', loadComponent: () => import('./features/import/import.page').then((m) => m.ImportPage), title: 'Import resume - XCron CV' },
      { path: 'ats', loadComponent: () => import('./features/ats-engine/ats-engine.page').then((m) => m.AtsEnginePage), title: 'ATS score - XCron CV' },
      { path: 'parsing-test', loadComponent: () => import('./features/parsing-test/parsing-test.page').then((m) => m.ParsingTestPage), title: 'Parsing test - XCron CV' },
      { path: 'career-imports', loadComponent: () => import('./features/career-imports/career-imports.page').then((m) => m.CareerImportsPage), title: 'Import career data - XCron CV' },
      { path: 'career-facts', loadComponent: () => import('./features/career-facts/career-facts.page').then((m) => m.CareerFactsPage), title: 'Achievement bank - XCron CV' },
      { path: 'evidence-check', loadComponent: () => import('./features/provenance/provenance.page').then((m) => m.ProvenancePage), title: 'Evidence check - XCron CV' },
      { path: 'resumes/:id/versions', loadComponent: () => import('./features/resume-versions/resume-versions.page').then((m) => m.ResumeVersionsPage), title: 'Versions - XCron CV' },
      { path: 'files', loadComponent: () => import('./features/local-files/local-files.page').then((m) => m.LocalFilesPage), title: 'Local files - XCron CV' },
      { path: 'templates', loadComponent: () => import('./pages/templates.page').then((m) => m.TemplatesPage), title: 'Templates - XCron CV' },
      // Career tools (docs 42, 46, 48): one hub, three independent feature routes.
      { path: 'career-tools', loadComponent: () => import('./pages/career-tools.page').then((m) => m.CareerToolsPage), title: 'Career tools - XCron CV' },
      { path: 'cover-letters', loadComponent: () => import('./pages/cover-letters.page').then((m) => m.CoverLettersPage), title: 'Cover letters - XCron CV' },
      { path: 'cover-letters/:id', loadComponent: () => import('./pages/cover-letter-editor.page').then((m) => m.CoverLetterEditorPage), title: 'Cover letter - XCron CV' },
      { path: 'contacts', loadComponent: () => import('./pages/contacts.page').then((m) => m.ContactsPage), title: 'Contacts - XCron CV' },
      { path: 'job-analytics', loadComponent: () => import('./pages/job-analytics.page').then((m) => m.JobAnalyticsPage), title: 'Job search analytics - XCron CV' },
      // Docs 41, 47, 49
      { path: 'portfolio', loadComponent: () => import('./pages/portfolio.page').then((m) => m.PortfolioPage), title: 'Portfolio - XCron CV' },
      { path: 'autofill', loadComponent: () => import('./pages/autofill.page').then((m) => m.AutofillPage), title: 'Autofill assistant - XCron CV' },
      { path: 'wallet', loadComponent: () => import('./pages/evidence-wallet.page').then((m) => m.EvidenceWalletPage), title: 'Evidence wallet - XCron CV' },
      // Docs 20/31, 22, 23/29: resume insights (quality, recruiter view, job match)
      { path: 'admin/usage', loadComponent: () => import('./pages/admin-usage.page').then((m) => m.AdminUsagePage), title: 'Usage analytics - XCron CV' },
      { path: 'insights', loadComponent: () => import('./pages/insights.page').then((m) => m.InsightsPage), title: 'Insights - XCron CV' },
      { path: 'match', loadComponent: () => import('./pages/match.page').then((m) => m.MatchPage), title: 'Job match - XCron CV' },
      { path: 'match/reports/:id', loadComponent: () => import('./pages/match-report.page').then((m) => m.MatchReportPage), title: 'Match report - XCron CV' },
      { path: 'quality', loadComponent: () => import('./pages/quality.page').then((m) => m.QualityPage), title: 'Quality check - XCron CV' },
      // Docs 33, 34, 35, 36: vault, readiness, interview preparation, feedback sharing
      { path: 'application-vault', loadComponent: () => import('./pages/application-vault.page').then((m) => m.ApplicationVaultPage), title: 'Application vault - XCron CV' },
      { path: 'readiness', loadComponent: () => import('./pages/readiness.page').then((m) => m.ReadinessPage), title: 'Career readiness - XCron CV' },
      { path: 'interview-prep', loadComponent: () => import('./pages/interview-prep.page').then((m) => m.InterviewPrepPage), title: 'Interview preparation - XCron CV' },
      { path: 'feedback-shares', loadComponent: () => import('./pages/feedback-shares.page').then((m) => m.FeedbackSharesPage), title: 'Feedback and sharing - XCron CV' },
      // Docs 06/38: optional AI assistant
      { path: 'ai', loadComponent: () => import('./pages/ai-assistant.page').then((m) => m.AiAssistantPage), title: 'AI assistant - XCron CV' },
      // Doc 37: webhooks and API access
      { path: 'integrations', loadComponent: () => import('./pages/integrations.page').then((m) => m.IntegrationsPage), title: 'Integrations - XCron CV' },
      // Doc 44: career path and compensation context
      { path: 'career-path', loadComponent: () => import('./pages/career-path.page').then((m) => m.CareerPathPage), title: 'Career path - XCron CV' },
      // Doc 45: job clipper
      { path: 'clips', loadComponent: () => import('./pages/job-clipper.page').then((m) => m.JobClipperPage), title: 'Job clipper - XCron CV' },
      // Doc 32: job portal integration
      { path: 'portal-jobs', loadComponent: () => import('./pages/portal-jobs.page').then((m) => m.PortalJobsPage), title: 'Portal jobs - XCron CV' },
      // Doc 51: interview copilot (text practice)
      { path: 'interview-copilot', loadComponent: () => import('./pages/interview-copilot.page').then((m) => m.InterviewCopilotPage), title: 'Interview copilot - XCron CV' },
      // Doc 52: career document suite
      { path: 'documents', loadComponent: () => import('./pages/career-documents.page').then((m) => m.CareerDocumentsPage), title: 'Career documents - XCron CV' },
      // Doc 50: expert review (consent-based, scoped)
      { path: 'expert-review', loadComponent: () => import('./pages/expert-review.page').then((m) => m.ExpertReviewPage), title: 'Expert review - XCron CV' },
      { path: 'settings', loadComponent: () => import('./pages/settings.page').then((m) => m.SettingsPage), title: 'Settings - XCron CV' },
    ],
  },
  { path: '**', redirectTo: '' },
];
