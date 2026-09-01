-- CreatePartialUniqueIndex for Active Invitation Concurrency Hardening
CREATE UNIQUE INDEX IF NOT EXISTS "Invitation_active_candidate_assessment_unique"
ON "public"."Invitation" ("assessmentId", "candidateId")
WHERE "status" IN ('PENDING', 'SENT', 'OPENED');
