"use strict";

/**
 * =============================================================================
 * HireQuest Phase 2A — Schema & Transactional Migration Contract Test Suite
 * File: backend/tests/staging/phase2a-schema-migration.test.js
 * =============================================================================
 * Validates structural, syntactical, and invariant compliance of:
 * - backend/prisma/schema.prisma
 * - backend/prisma/migrations/20261029000000_phase2a_expand_schema/migration.sql
 * =============================================================================
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const SCHEMA_PATH = path.resolve(__dirname, "../../prisma/schema.prisma");
const MIGRATION_PATH = path.resolve(
  __dirname,
  "../../prisma/migrations/20261029000000_phase2a_expand_schema/migration.sql"
);

test("Phase 2A Schema & Transactional Migration Invariants", async (suite) => {
  const schemaContent = fs.readFileSync(SCHEMA_PATH, "utf8");
  const migrationContent = fs.readFileSync(MIGRATION_PATH, "utf8");

  await suite.test("1. schema.prisma defines nullable companyId, isQuarantined, and composite unique on Assessment", () => {
    assert.match(
      schemaContent,
      /model Assessment \{[\s\S]*?companyId\s+String\?[\s\S]*?isQuarantined\s+Boolean\s+@default\(false\)/,
      "Assessment must define companyId String? and isQuarantined Boolean @default(false)"
    );
    assert.match(
      schemaContent,
      /@@unique\(\[id,\s*companyId\],\s*map:\s*"idx_assessment_id_company"\)/,
      "Assessment must define @@unique([id, companyId], map: 'idx_assessment_id_company')"
    );
    assert.match(
      schemaContent,
      /@@index\(\[companyId,\s*status\],\s*map:\s*"idx_assessment_company_status"\)/,
      "Assessment must define @@index([companyId, status], map: 'idx_assessment_company_status')"
    );
    assert.match(
      schemaContent,
      /@@index\(\[isQuarantined\],\s*map:\s*"idx_assessment_is_quarantined"\)/,
      "Assessment must define @@index([isQuarantined], map: 'idx_assessment_is_quarantined')"
    );
  });

  await suite.test("2. schema.prisma defines mapped companyId indexes on Invitation and CandidateAttempt", () => {
    assert.match(
      schemaContent,
      /model Invitation \{[\s\S]*?companyId\s+String\?[\s\S]*?@@index\(\[companyId\],\s*map:\s*"idx_invitation_company"\)/,
      "Invitation must define companyId String? and mapped index idx_invitation_company"
    );
    assert.match(
      schemaContent,
      /model CandidateAttempt \{[\s\S]*?companyId\s+String\?[\s\S]*?@@index\(\[companyId\],\s*map:\s*"idx_candidate_attempt_company"\)/,
      "CandidateAttempt must define companyId String? and mapped index idx_candidate_attempt_company"
    );
  });

  await suite.test("3. schema.prisma retains UserMailbox.userId @unique and mapped companyId index", () => {
    assert.match(
      schemaContent,
      /model UserMailbox \{[\s\S]*?userId\s+String\s+@unique/,
      "UserMailbox must retain userId String @unique to preserve 1-to-1 cardinality"
    );
    assert.match(
      schemaContent,
      /model UserMailbox \{[\s\S]*?companyId\s+String\?[\s\S]*?@@index\(\[companyId\],\s*map:\s*"idx_user_mailbox_company"\)/,
      "UserMailbox must define companyId String? and mapped index idx_user_mailbox_company"
    );
  });

  await suite.test("4. schema.prisma disambiguates candidateInvitations on Company model", () => {
    assert.match(
      schemaContent,
      /model Company \{[\s\S]*?candidateInvitations\s+Invitation\[\]/,
      "Company must define candidateInvitations Invitation[] to avoid clash with invitations CompanyInvitation[]"
    );
    assert.match(
      schemaContent,
      /model Company \{[\s\S]*?invitations\s+CompanyInvitation\[\]/,
      "Company must preserve invitations CompanyInvitation[]"
    );
  });

  await suite.test("5. schema.prisma defines decoupled quarantine audit models", () => {
    assert.match(
      schemaContent,
      /model AssessmentQuarantineLog \{[\s\S]*?assessmentId\s+String[\s\S]*?reason\s+String[\s\S]*?evidence\s+Json/,
      "AssessmentQuarantineLog must define scalar assessmentId, reason, and evidence"
    );
    assert.match(
      schemaContent,
      /model QuarantineResolutionEvent \{[\s\S]*?quarantineLogId\s+String[\s\S]*?action\s+String/,
      "QuarantineResolutionEvent must define quarantineLogId String and action String"
    );
  });

  await suite.test("6. migration.sql sets lock_timeout = '3s'", () => {
    assert.match(
      migrationContent,
      /SET lock_timeout = '3s';/i,
      "Migration must set lock_timeout = '3s' to prevent connection pool exhaustion"
    );
  });

  await suite.test("7. migration.sql contains ZERO CONCURRENTLY statements", () => {
    assert.doesNotMatch(
      migrationContent,
      /CREATE\s+INDEX\s+CONCURRENTLY/i,
      "migration.sql must never contain CREATE INDEX CONCURRENTLY (violates PG Error 25001)"
    );
    assert.doesNotMatch(
      migrationContent,
      /DROP\s+INDEX\s+CONCURRENTLY/i,
      "migration.sql must never contain DROP INDEX CONCURRENTLY (violates PG Error 25001)"
    );
  });

  await suite.test("8. migration.sql creates all foreign keys with NOT VALID", () => {
    const fkMatches = migrationContent.match(/ADD CONSTRAINT[\s\S]*?FOREIGN KEY[\s\S]*?NOT VALID;/gi);
    assert.ok(fkMatches && fkMatches.length >= 4, "All foreign keys must be defined with NOT VALID");
  });

  await suite.test("9. migration.sql creates quarantine audit indexes for new tables", () => {
    assert.match(
      migrationContent,
      /CREATE INDEX IF NOT EXISTS "AssessmentQuarantineLog_assessmentId_idx"/,
      "Must create AssessmentQuarantineLog_assessmentId_idx"
    );
    assert.match(
      migrationContent,
      /CREATE INDEX IF NOT EXISTS "AssessmentQuarantineLog_quarantinedAt_idx"/,
      "Must create AssessmentQuarantineLog_quarantinedAt_idx"
    );
    assert.match(
      migrationContent,
      /CREATE INDEX IF NOT EXISTS "QuarantineResolutionEvent_quarantineLogId_idx"/,
      "Must create QuarantineResolutionEvent_quarantineLogId_idx"
    );
    assert.match(
      migrationContent,
      /CREATE INDEX IF NOT EXISTS "QuarantineResolutionEvent_resolvedAt_idx"/,
      "Must create QuarantineResolutionEvent_resolvedAt_idx"
    );
  });

  await suite.test("10. migration.sql enforces UPDATE, DELETE, and TRUNCATE protection on quarantine tables", () => {
    assert.match(
      migrationContent,
      /CREATE OR REPLACE FUNCTION prevent_quarantine_log_mutation\(\)/,
      "Migration must define prevent_quarantine_log_mutation function"
    );
    assert.match(
      migrationContent,
      /BEFORE UPDATE OR DELETE ON "AssessmentQuarantineLog"/,
      "AssessmentQuarantineLog must have BEFORE UPDATE OR DELETE trigger"
    );
    assert.match(
      migrationContent,
      /BEFORE TRUNCATE ON "AssessmentQuarantineLog"/,
      "AssessmentQuarantineLog must have BEFORE TRUNCATE trigger"
    );
    assert.match(
      migrationContent,
      /BEFORE UPDATE OR DELETE ON "QuarantineResolutionEvent"/,
      "QuarantineResolutionEvent must have BEFORE UPDATE OR DELETE trigger"
    );
    assert.match(
      migrationContent,
      /BEFORE TRUNCATE ON "QuarantineResolutionEvent"/,
      "QuarantineResolutionEvent must have BEFORE TRUNCATE trigger"
    );
  });
});
