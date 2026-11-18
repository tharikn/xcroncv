-- Adaptive Resume Layout Engine (Quick Build): resolved plan, frozen content, build diagnostics.
ALTER TABLE "Resume" ADD COLUMN "layoutPlan" JSONB,
ADD COLUMN "renderSnapshot" JSONB,
ADD COLUMN "buildReport" JSONB;
