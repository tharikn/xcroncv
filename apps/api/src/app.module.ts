import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthGuard } from './common/auth/auth.guard';
import { CareerProfileModule } from './career-profile/career-profile.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ResumesModule } from './resumes/resumes.module';
import { TemplatesModule } from './templates/templates.module';
import { featureEnabled } from './common/features';
import { DomainEventsModule } from './common/domain-events';
import { CoverLettersModule } from './cover-letters/cover-letters.module';
import { CrmModule } from './crm/crm.module';
import { JobAnalyticsModule } from './job-analytics/job-analytics.module';
import { ImportExportModule } from './import-export/import-export.module';
import { ParsingTestModule } from './parsing-test/parsing-test.module';
import { CareerFactsModule } from './career-facts/career-facts.module';
import { ProvenanceModule } from './provenance/provenance.module';
import { ResumeVersionsModule } from './resume-versions/resume-versions.module';
import { CareerImportsModule } from './career-imports/career-imports.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { AutofillModule } from './autofill/autofill.module';
import { EvidenceWalletModule } from './evidence-wallet/evidence-wallet.module';
import { ApplicationVaultModule } from './application-vault/application-vault.module';
import { ReadinessModule } from './readiness/readiness.module';
import { InterviewPrepModule } from './interview-prep/interview-prep.module';
import { FeedbackSharingModule } from './feedback-sharing/feedback-sharing.module';
import { ResumeMatchModule } from './resume-match/resume-match.module';
import { QualityReviewModule } from './quality-review/quality-review.module';
import { RecruiterViewModule } from './recruiter-view/recruiter-view.module';
import { AiModule } from './ai/ai.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { CareerPathModule } from './career-path/career-path.module';
import { JobClipperModule } from './job-clipper/job-clipper.module';
import { JobPortalModule } from './job-portal/job-portal.module';
import { InterviewCopilotModule } from './interview-copilot/interview-copilot.module';
import { CareerDocumentsModule } from './career-documents/career-documents.module';
import { ExpertReviewModule } from './expert-review/expert-review.module';
import { AtsEngineModule } from './ats-engine/ats-engine.module';
import { UsageAnalyticsModule } from './usage-analytics/usage-analytics.module';
import { PreferencesModule } from './preferences/preferences.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    DomainEventsModule, PrismaModule, CareerProfileModule, TemplatesModule, ResumesModule,
    ImportExportModule, // module 06: import + DOCX/XLSX export
    ...(featureEnabled('ats-engine') ? [AtsEngineModule] : []), // module 07: ATS compatibility engine (doc 07)
    ...(featureEnabled('parsing-test') ? [ParsingTestModule] : []), // module 07: parsing test + parser lab (docs 21, 30)
    ...(featureEnabled('career-facts') ? [CareerFactsModule] : []), // module 26: career facts + achievement bank
    ...(featureEnabled('provenance') ? [ProvenanceModule] : []), // module 27: truth verification + evidence provenance
    ...(featureEnabled('resume-versions') ? [ResumeVersionsModule] : []), // module 28: variants + immutable versions
    ...(featureEnabled('career-imports') ? [CareerImportsModule] : []), // module 43: external profile + career data import
    // Optional feature modules (docs 42, 46, 48); each can be disabled via FEATURES_DISABLED.
    ...(featureEnabled('cover-letters') ? [CoverLettersModule] : []),
    ...(featureEnabled('crm') ? [CrmModule] : []),
    ...(featureEnabled('job-analytics') ? [JobAnalyticsModule] : []),
    // Docs 41, 47, 49 (FEATURES_DISABLED=portfolio,autofill,evidence-wallet)
    ...(featureEnabled('portfolio') ? [PortfolioModule] : []),
    ...(featureEnabled('autofill') ? [AutofillModule] : []),
    ...(featureEnabled('evidence-wallet') ? [EvidenceWalletModule] : []),
    // Docs 20/31, 22, 23/29 (FEATURES_DISABLED=quality-review,recruiter-view,resume-match)
    ...(featureEnabled('resume-match') ? [ResumeMatchModule] : []),
    ...(featureEnabled('quality-review') ? [QualityReviewModule] : []),
    ...(featureEnabled('recruiter-view') ? [RecruiterViewModule] : []),
    // Docs 33, 34, 35, 36 (FEATURES_DISABLED=resume-vault,career-readiness,interview-prep,feedback-sharing)
    ...(featureEnabled('resume-vault') ? [ApplicationVaultModule] : []),
    ...(featureEnabled('career-readiness') ? [ReadinessModule] : []),
    ...(featureEnabled('interview-prep') ? [InterviewPrepModule] : []),
    ...(featureEnabled('feedback-sharing') ? [FeedbackSharingModule] : []),
    // Docs 06/38 (FEATURES_DISABLED=ai)
    ...(featureEnabled('ai') ? [AiModule] : []),
    // Doc 37 (FEATURES_DISABLED=webhooks)
    ...(featureEnabled('webhooks') ? [WebhooksModule] : []),
    // Doc 44 (FEATURES_DISABLED=career-path)
    ...(featureEnabled('career-path') ? [CareerPathModule] : []),
    // Doc 45 (FEATURES_DISABLED=job-clipper)
    ...(featureEnabled('job-clipper') ? [JobClipperModule] : []),
    // Doc 32 (FEATURES_DISABLED=job-portal)
    ...(featureEnabled('job-portal') ? [JobPortalModule] : []),
    // Doc 51 (FEATURES_DISABLED=interview-copilot)
    ...(featureEnabled('interview-copilot') ? [InterviewCopilotModule] : []),
    // Doc 52 (FEATURES_DISABLED=career-documents)
    ...(featureEnabled('career-documents') ? [CareerDocumentsModule] : []),
    // Doc 50 (FEATURES_DISABLED=expert-review)
    ...(featureEnabled('expert-review') ? [ExpertReviewModule] : []),
    // Doc 16 admin usage analytics (FEATURES_DISABLED=usage-analytics)
    ...(featureEnabled('usage-analytics') ? [UsageAnalyticsModule] : []),
    // Common app features: per-user theme + language preference
    PreferencesModule,
  ],
  controllers: [HealthController],
  providers: [
    // Authentication is deny-by-default: every route needs a valid token unless marked @Public().
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
