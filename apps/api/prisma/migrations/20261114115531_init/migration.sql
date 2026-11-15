-- CreateEnum
CREATE TYPE "BulletKind" AS ENUM ('RESPONSIBILITY', 'ACHIEVEMENT');

-- CreateEnum
CREATE TYPE "ResumeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "links" JSONB NOT NULL DEFAULT '[]',
    "headline" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experience" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "employerName" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "employmentType" TEXT,
    "location" TEXT,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienceBullet" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "kind" "BulletKind" NOT NULL DEFAULT 'RESPONSIBILITY',
    "content" TEXT NOT NULL,
    "isUserConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ExperienceBullet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "proficiency" TEXT,
    "yearsUsed" INTEGER,
    "isUserConfirmed" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Education" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "field" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "grade" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "description" TEXT,
    "technologies" TEXT[],
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT,
    "issuedDate" TEXT,
    "expiryDate" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Certification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "proficiency" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetRole" TEXT,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "status" "ResumeStatus" NOT NULL DEFAULT 'DRAFT',
    "sections" JSONB NOT NULL,
    "overrides" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "structuredSnapshot" JSONB NOT NULL,
    "changeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverLetter" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "jobTitle" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'standard',
    "tone" TEXT NOT NULL DEFAULT 'professional',
    "length" TEXT NOT NULL DEFAULT 'medium',
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "resumeId" TEXT,
    "resumeVersionId" TEXT,
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverLetter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverLetterVersion" (
    "id" TEXT NOT NULL,
    "coverLetterId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "sections" JSONB NOT NULL,
    "claims" JSONB NOT NULL DEFAULT '[]',
    "changeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverLetterVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverLetterApplicationBinding" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coverLetterId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "resumeVersionId" TEXT,
    "applicationRef" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverLetterApplicationBinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "organization" TEXT,
    "role" TEXT,
    "relationship" TEXT NOT NULL DEFAULT 'OTHER',
    "channels" JSONB NOT NULL DEFAULT '[]',
    "tags" TEXT[],
    "notesEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactLink" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "externalRef" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSearchEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "applicationRef" TEXT NOT NULL,
    "roleFamily" TEXT,
    "geography" TEXT,
    "seniority" TEXT,
    "sourceName" TEXT,
    "resumeVersionId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSearchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleFamily" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "publishedVersion" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "noIndex" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT,
    "passwordFailCount" INTEGER NOT NULL DEFAULT 0,
    "passwordLockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioVersion" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "selection" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "changeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortfolioEvent" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "versionNumber" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutofillSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adapterId" TEXT NOT NULL,
    "targetHost" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "consentedKeys" JSONB NOT NULL DEFAULT '[]',
    "sensitiveConsent" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "authorizedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutofillSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutofillAuditEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fieldKeys" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutofillAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'CERTIFICATION',
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "issuedOn" TEXT,
    "expiresOn" TEXT,
    "credentialIdEnc" TEXT,
    "credentialIdLast4" TEXT,
    "verificationUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SELF_REPORTED',
    "statusSource" TEXT NOT NULL DEFAULT 'USER',
    "statusAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recheckAfter" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceReference" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT,
    "profileItemType" TEXT,
    "profileItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialVerification" (
    "id" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recheckAfter" TIMESTAMP(3),

    CONSTRAINT "CredentialVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialDisclosureGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "recipientLabel" TEXT,
    "fields" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialDisclosureGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobDescription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "location" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceDomain" TEXT,
    "canonicalUrl" TEXT,
    "rawText" TEXT,
    "contentHash" TEXT NOT NULL,
    "requirements" JSONB NOT NULL,
    "extractionVersion" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "confirmationStatus" TEXT NOT NULL DEFAULT 'UNCONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobDescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeMatchReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "resumeVersionId" TEXT,
    "resumeVersionNumber" INTEGER,
    "resumeContentHash" TEXT NOT NULL,
    "jobDescriptionId" TEXT NOT NULL,
    "jdRevision" INTEGER NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "totalScore" INTEGER NOT NULL,
    "dimensionScores" JSONB NOT NULL,
    "coverage" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeMatchReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "resumeVersionId" TEXT,
    "resumeVersionNumber" INTEGER,
    "resumeContentHash" TEXT NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "readiness" TEXT NOT NULL,
    "dimensionScores" JSONB NOT NULL,
    "coverage" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationResumeEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "employerLabel" TEXT NOT NULL,
    "jobTitle" TEXT,
    "externalJobId" TEXT,
    "appliedOn" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "resumeVersionId" TEXT NOT NULL,
    "resumeVersionNumber" INTEGER NOT NULL,
    "resumeContentHash" TEXT NOT NULL,
    "coverLetterVersionRef" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'APPLIED',
    "notes" TEXT,
    "followUpOn" TEXT,
    "followUpDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationResumeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "targetSkills" JSONB NOT NULL,
    "analysis" JSONB NOT NULL,
    "milestones" JSONB NOT NULL,
    "analysisVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadinessPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewPrepSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "resumeVersionId" TEXT,
    "roleTitle" TEXT,
    "company" TEXT,
    "questions" JSONB NOT NULL,
    "generator" TEXT NOT NULL DEFAULT 'deterministic-1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewPrepSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackShare" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "resumeVersionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "recipientLabel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'FEEDBACK',
    "permissions" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackEntry" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clarity" INTEGER,
    "relevance" INTEGER,
    "evidence" INTEGER,
    "presentation" INTEGER,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "decisionNote" TEXT,
    "appliedVersionNumber" INTEGER,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiUsageEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSuggestion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "inputPreview" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "events" JSONB NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "secretHint" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "secretVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseCode" INTEGER,
    "error" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParsingTestReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT,
    "source" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "suiteVersion" TEXT NOT NULL,
    "parserProfiles" JSONB NOT NULL,
    "score" INTEGER,
    "report" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParsingTestReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetRoleId" TEXT NOT NULL,
    "taxonomyVersion" TEXT NOT NULL,
    "basis" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerMilestone" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetDate" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClippedJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "url" TEXT,
    "hostname" TEXT,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "contentHash" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClippedJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtensionSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtensionSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptureAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "clipId" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaptureAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalJobContext" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "applyUrl" TEXT,
    "description" TEXT NOT NULL,
    "requirements" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalJobContext_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TailoringProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobContextId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "decisions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TailoringProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PortalApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobContextId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "proposalId" TEXT,
    "hostStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "terms" JSONB NOT NULL,
    "questions" JSONB NOT NULL,
    "retainAnswers" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CopilotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CopilotAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT,
    "wordCount" INTEGER NOT NULL,
    "feedback" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CopilotAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "sections" JSONB NOT NULL,
    "claims" JSONB NOT NULL,
    "changeSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerDocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertReviewRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "resumeVersionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerLabel" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "paymentStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpertReviewRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertReviewFeedback" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" TEXT,
    "clarity" INTEGER,
    "relevance" INTEGER,
    "evidence" INTEGER,
    "presentation" INTEGER,
    "comment" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpertReviewFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpertReviewEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ref" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpertReviewEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerFact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "source" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerFact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerFactRevision" (
    "id" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerFactRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvenanceLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "claimKey" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "factId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvenanceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewriteProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT,
    "origin" TEXT NOT NULL,
    "original" TEXT NOT NULL,
    "proposed" TEXT NOT NULL,
    "diff" JSONB NOT NULL,
    "unsupported" JSONB NOT NULL,
    "verdict" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "acknowledged" JSONB,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewriteProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVariant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentResumeId" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResumeVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersionMeta" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "profileUpdatedAt" TIMESTAMP(3),
    "label" TEXT,
    "restoredFrom" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeVersionMeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerImportJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "fields" JSONB NOT NULL,
    "decisions" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "undo" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportAuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "platform" TEXT NOT NULL,
    "appVersion" TEXT,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    "resumeId" TEXT,
    "exportFormat" TEXT,
    "status" TEXT,
    "failureCategory" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "resumeVersionId" TEXT,
    "resumeVersionNumber" INTEGER,
    "resumeContentHash" TEXT NOT NULL,
    "jobDescriptionId" TEXT NOT NULL,
    "jdRevision" INTEGER NOT NULL,
    "jdTitle" TEXT NOT NULL,
    "jdCompany" TEXT,
    "jobConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "atsVersion" TEXT NOT NULL,
    "taxonomyVersion" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "dimensions" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "coverage" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtsReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_issuer_subject_key" ON "User"("issuer", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "CareerProfile_userId_key" ON "CareerProfile"("userId");

-- CreateIndex
CREATE INDEX "CareerProfile_tenantId_idx" ON "CareerProfile"("tenantId");

-- CreateIndex
CREATE INDEX "Experience_profileId_idx" ON "Experience"("profileId");

-- CreateIndex
CREATE INDEX "ExperienceBullet_experienceId_idx" ON "ExperienceBullet"("experienceId");

-- CreateIndex
CREATE INDEX "Skill_profileId_idx" ON "Skill"("profileId");

-- CreateIndex
CREATE INDEX "Education_profileId_idx" ON "Education"("profileId");

-- CreateIndex
CREATE INDEX "Project_profileId_idx" ON "Project"("profileId");

-- CreateIndex
CREATE INDEX "Certification_profileId_idx" ON "Certification"("profileId");

-- CreateIndex
CREATE INDEX "Language_profileId_idx" ON "Language"("profileId");

-- CreateIndex
CREATE INDEX "Resume_profileId_idx" ON "Resume"("profileId");

-- CreateIndex
CREATE INDEX "Resume_tenantId_idx" ON "Resume"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeVersion_resumeId_versionNumber_key" ON "ResumeVersion"("resumeId", "versionNumber");

-- CreateIndex
CREATE INDEX "CoverLetter_tenantId_userId_idx" ON "CoverLetter"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CoverLetterVersion_coverLetterId_versionNumber_key" ON "CoverLetterVersion"("coverLetterId", "versionNumber");

-- CreateIndex
CREATE INDEX "CoverLetterApplicationBinding_tenantId_userId_idx" ON "CoverLetterApplicationBinding"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CoverLetterApplicationBinding_userId_applicationRef_coverLe_key" ON "CoverLetterApplicationBinding"("userId", "applicationRef", "coverLetterId");

-- CreateIndex
CREATE INDEX "CareerContact_tenantId_userId_idx" ON "CareerContact"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerContact_userId_nameKey_key" ON "CareerContact"("userId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "ContactLink_contactId_kind_externalRef_key" ON "ContactLink"("contactId", "kind", "externalRef");

-- CreateIndex
CREATE INDEX "JobActivity_tenantId_userId_occurredAt_idx" ON "JobActivity"("tenantId", "userId", "occurredAt");

-- CreateIndex
CREATE INDEX "FollowUpTask_tenantId_userId_status_dueAt_idx" ON "FollowUpTask"("tenantId", "userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "JobSearchEvent_tenantId_userId_occurredAt_idx" ON "JobSearchEvent"("tenantId", "userId", "occurredAt");

-- CreateIndex
CREATE INDEX "JobSearchEvent_userId_applicationRef_idx" ON "JobSearchEvent"("userId", "applicationRef");

-- CreateIndex
CREATE UNIQUE INDEX "JobSearchEvent_userId_idempotencyKey_key" ON "JobSearchEvent"("userId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_tokenHash_key" ON "Portfolio"("tokenHash");

-- CreateIndex
CREATE INDEX "Portfolio_tenantId_userId_updatedAt_idx" ON "Portfolio"("tenantId", "userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PortfolioVersion_portfolioId_versionNumber_key" ON "PortfolioVersion"("portfolioId", "versionNumber");

-- CreateIndex
CREATE INDEX "PortfolioEvent_portfolioId_type_createdAt_idx" ON "PortfolioEvent"("portfolioId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AutofillSession_tenantId_userId_createdAt_idx" ON "AutofillSession"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AutofillAuditEvent_sessionId_createdAt_idx" ON "AutofillAuditEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CredentialRecord_tenantId_userId_updatedAt_idx" ON "CredentialRecord"("tenantId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "EvidenceReference_credentialId_idx" ON "EvidenceReference"("credentialId");

-- CreateIndex
CREATE INDEX "CredentialVerification_credentialId_checkedAt_idx" ON "CredentialVerification"("credentialId", "checkedAt");

-- CreateIndex
CREATE INDEX "CredentialDisclosureGrant_tenantId_userId_credentialId_idx" ON "CredentialDisclosureGrant"("tenantId", "userId", "credentialId");

-- CreateIndex
CREATE INDEX "JobDescription_tenantId_userId_idx" ON "JobDescription"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "ResumeMatchReport_tenantId_userId_resumeId_idx" ON "ResumeMatchReport"("tenantId", "userId", "resumeId");

-- CreateIndex
CREATE INDEX "ResumeMatchReport_jobDescriptionId_idx" ON "ResumeMatchReport"("jobDescriptionId");

-- CreateIndex
CREATE INDEX "QualityReview_tenantId_userId_resumeId_idx" ON "QualityReview"("tenantId", "userId", "resumeId");

-- CreateIndex
CREATE INDEX "ApplicationResumeEntry_tenantId_userId_appliedOn_idx" ON "ApplicationResumeEntry"("tenantId", "userId", "appliedOn");

-- CreateIndex
CREATE INDEX "ReadinessPlan_tenantId_userId_updatedAt_idx" ON "ReadinessPlan"("tenantId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "InterviewPrepSession_tenantId_userId_updatedAt_idx" ON "InterviewPrepSession"("tenantId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "FeedbackShare_tenantId_userId_createdAt_idx" ON "FeedbackShare"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "FeedbackEntry_shareId_createdAt_idx" ON "FeedbackEntry"("shareId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiSetting_tenantId_userId_key" ON "AiSetting"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "AiUsageEvent_tenantId_userId_createdAt_idx" ON "AiUsageEvent"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiSuggestion_tenantId_userId_createdAt_idx" ON "AiSuggestion"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookEndpoint_tenantId_userId_idx" ON "WebhookEndpoint"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "WebhookDelivery_tenantId_userId_createdAt_idx" ON "WebhookDelivery"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "WebhookDelivery_endpointId_idx" ON "WebhookDelivery"("endpointId");

-- CreateIndex
CREATE INDEX "ParsingTestReport_tenantId_userId_createdAt_idx" ON "ParsingTestReport"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ParsingTestReport_tenantId_userId_resumeId_idx" ON "ParsingTestReport"("tenantId", "userId", "resumeId");

-- CreateIndex
CREATE INDEX "CareerPlan_tenantId_userId_idx" ON "CareerPlan"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "CareerMilestone_planId_idx" ON "CareerMilestone"("planId");

-- CreateIndex
CREATE INDEX "ClippedJob_tenantId_userId_createdAt_idx" ON "ClippedJob"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ClippedJob_tenantId_userId_contentHash_idx" ON "ClippedJob"("tenantId", "userId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "ClippedJob_tenantId_userId_idempotencyKey_key" ON "ClippedJob"("tenantId", "userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ExtensionSession_tenantId_userId_idx" ON "ExtensionSession"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "CaptureAuditEvent_tenantId_userId_createdAt_idx" ON "CaptureAuditEvent"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "PortalJobContext_tenantId_userId_idx" ON "PortalJobContext"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalJobContext_tenantId_userId_hostId_externalId_key" ON "PortalJobContext"("tenantId", "userId", "hostId", "externalId");

-- CreateIndex
CREATE INDEX "TailoringProposal_tenantId_userId_jobContextId_idx" ON "TailoringProposal"("tenantId", "userId", "jobContextId");

-- CreateIndex
CREATE INDEX "PortalApplication_tenantId_userId_idx" ON "PortalApplication"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalApplication_tenantId_userId_jobContextId_resumeId_ver_key" ON "PortalApplication"("tenantId", "userId", "jobContextId", "resumeId", "versionNumber");

-- CreateIndex
CREATE INDEX "CopilotSession_tenantId_userId_createdAt_idx" ON "CopilotSession"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "CopilotAnswer_sessionId_idx" ON "CopilotAnswer"("sessionId");

-- CreateIndex
CREATE INDEX "CareerDocument_tenantId_userId_idx" ON "CareerDocument"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerDocumentVersion_documentId_versionNumber_key" ON "CareerDocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "ExpertReviewRequest_tenantId_userId_createdAt_idx" ON "ExpertReviewRequest"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExpertReviewFeedback_requestId_createdAt_idx" ON "ExpertReviewFeedback"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "ExpertReviewEvent_requestId_createdAt_idx" ON "ExpertReviewEvent"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "CareerFact_tenantId_userId_kind_status_idx" ON "CareerFact"("tenantId", "userId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CareerFactRevision_factId_revision_key" ON "CareerFactRevision"("factId", "revision");

-- CreateIndex
CREATE INDEX "ProvenanceLink_tenantId_userId_resumeId_idx" ON "ProvenanceLink"("tenantId", "userId", "resumeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProvenanceLink_resumeId_claimKey_factId_key" ON "ProvenanceLink"("resumeId", "claimKey", "factId");

-- CreateIndex
CREATE INDEX "RewriteProposal_tenantId_userId_createdAt_idx" ON "RewriteProposal"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeVariant_resumeId_key" ON "ResumeVariant"("resumeId");

-- CreateIndex
CREATE INDEX "ResumeVariant_tenantId_userId_idx" ON "ResumeVariant"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeVersionMeta_versionId_key" ON "ResumeVersionMeta"("versionId");

-- CreateIndex
CREATE INDEX "ResumeVersionMeta_resumeId_idx" ON "ResumeVersionMeta"("resumeId");

-- CreateIndex
CREATE INDEX "CareerImportJob_tenantId_userId_createdAt_idx" ON "CareerImportJob"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "CareerImportJob_expiresAt_idx" ON "CareerImportJob"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CareerImportJob_userId_idempotencyKey_key" ON "CareerImportJob"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ImportAuditEvent_tenantId_userId_createdAt_idx" ON "ImportAuditEvent"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_occurredAt_idx" ON "UsageEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "UsageEvent_name_occurredAt_idx" ON "UsageEvent"("name", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "UsageEvent_userId_eventId_key" ON "UsageEvent"("userId", "eventId");

-- CreateIndex
CREATE INDEX "AtsReport_tenantId_userId_resumeId_idx" ON "AtsReport"("tenantId", "userId", "resumeId");

-- AddForeignKey
ALTER TABLE "CareerProfile" ADD CONSTRAINT "CareerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experience" ADD CONSTRAINT "Experience_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CareerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceBullet" ADD CONSTRAINT "ExperienceBullet_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CareerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Education" ADD CONSTRAINT "Education_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CareerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CareerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certification" ADD CONSTRAINT "Certification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CareerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Language" ADD CONSTRAINT "Language_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CareerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CareerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverLetterVersion" ADD CONSTRAINT "CoverLetterVersion_coverLetterId_fkey" FOREIGN KEY ("coverLetterId") REFERENCES "CoverLetter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverLetterApplicationBinding" ADD CONSTRAINT "CoverLetterApplicationBinding_coverLetterId_fkey" FOREIGN KEY ("coverLetterId") REFERENCES "CoverLetter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLink" ADD CONSTRAINT "ContactLink_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CareerContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CareerContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CareerContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioVersion" ADD CONSTRAINT "PortfolioVersion_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioEvent" ADD CONSTRAINT "PortfolioEvent_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutofillAuditEvent" ADD CONSTRAINT "AutofillAuditEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutofillSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceReference" ADD CONSTRAINT "EvidenceReference_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "CredentialRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialVerification" ADD CONSTRAINT "CredentialVerification_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "CredentialRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialDisclosureGrant" ADD CONSTRAINT "CredentialDisclosureGrant_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "CredentialRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeMatchReport" ADD CONSTRAINT "ResumeMatchReport_jobDescriptionId_fkey" FOREIGN KEY ("jobDescriptionId") REFERENCES "JobDescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackEntry" ADD CONSTRAINT "FeedbackEntry_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "FeedbackShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerMilestone" ADD CONSTRAINT "CareerMilestone_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CareerPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CopilotAnswer" ADD CONSTRAINT "CopilotAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CopilotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerDocumentVersion" ADD CONSTRAINT "CareerDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "CareerDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertReviewFeedback" ADD CONSTRAINT "ExpertReviewFeedback_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ExpertReviewRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpertReviewEvent" ADD CONSTRAINT "ExpertReviewEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ExpertReviewRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerFactRevision" ADD CONSTRAINT "CareerFactRevision_factId_fkey" FOREIGN KEY ("factId") REFERENCES "CareerFact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
