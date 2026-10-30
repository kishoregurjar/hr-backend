# HireQuest Phase 2A — Operational Migration & Scaffolding Runbook

## Document Status & Scope
- **Phase**: Phase 2A — Expand Schema & Multi-Tenant Isolation Scaffolding
- **Target Environments**: Staging DB Clone (Gate 3) $\rightarrow$ Production (Gate 4)
- **Scope**: White-Label Multi-Tenant Isolation only.
- **Strictly Deferred**: Billing, subscriptions, credit consumption, commercial plans, payment gateways, quotas.
- **Governance Requirement**: Execution of commands in this runbook requires separate explicit human approval under **Gate 3**.

---

## 1. Preserved Business Invariants

All operations in this runbook must strictly preserve the following business rules:
1. **Creator-Only Assessment Publishing**: Preserves `assessment.createdById === user.id`. Publishing permissions are never expanded to company Admins, Owners, or other recruiters.
2. **Company-Scoped Title Uniqueness**: Two distinct companies may use identical assessment titles without conflict. Within a single company, active assessment titles must remain unique.
3. **Candidate Passwordless Access**: Candidate endpoints authenticate strictly via invitation magic tokens and OTP sessions; candidates must never be required to provide an `X-Company-Id` header.
4. **Archival vs Quarantine Separation**: Deletion remains archival (`status = ARCHIVED`). Quarantine (`isQuarantined = true`) is an orthogonal state with an append-only, immutable audit log.
5. **Exam Invariants**: Frozen question snapshots (`questionSnapshot`), sequential attempt numbering, answer versioning, and post-submission score immutability remain 100% intact.
6. **No Automatic Ownership from Creator Membership**: Creator membership is secondary/heuristic evidence. Ambiguous records remain unassigned and quarantined pending manual review.
7. **Mailbox Invariant & Killswitch**: `UserMailbox.userId @unique` (1-to-1) is retained. Background syncing remains disabled by default via `FEATURE_MAILBOX_SYNC_ENABLED=false`.

---

## 2. Gate 3 Preflight Checklist

Before executing any commands on staging or production:

- [ ] **1. Target Database Identity Preflight**:
  Verify the active connection target is the authorized staging database and NOT development or production.
  **Windows PowerShell:**
  ```powershell
  $env:EXPECTED_TARGET_DB = "hirequest_staging"
  $env:TARGET_ENVIRONMENT = "staging"
  node scripts/verify_target_db.js --mode=staging
  ```
  **POSIX / Bash:**
  ```bash
  export EXPECTED_TARGET_DB="hirequest_staging"
  export TARGET_ENVIRONMENT="staging"
  node scripts/verify_target_db.js --mode=staging
  ```
  *Safety Invariant*: Fails closed if `EXPECTED_TARGET_DB` is missing, does not match `current_database()`, or if `DIRECT_URL` points to an inconsistent database or production host.

- [ ] **2. Database Snapshot & Restore Rehearsal**:
  Full point-in-time compressed binary backup captured and verified against a scratch database:
  **Windows PowerShell:**
  ```powershell
  # 1. Create binary dump
  pg_dump -Fc --no-acl --no-owner -d $env:STAGING_DIRECT_URL -f "artifacts/backup_staging_pre_gate3b.dump"
  # 2. Checksum verification
  Get-FileHash -Algorithm SHA256 "artifacts/backup_staging_pre_gate3b.dump"
  # 3. Restore rehearsal on disposable scratch database
  pg_restore --clean --if-exists -d $env:STAGING_RESTORE_SCRATCH_URL "artifacts/backup_staging_pre_gate3b.dump"
  ```
  **POSIX / Bash:**
  ```bash
  pg_dump -Fc --no-acl --no-owner -d "$STAGING_DIRECT_URL" -f "artifacts/backup_staging_pre_gate3b.dump"
  sha256sum "artifacts/backup_staging_pre_gate3b.dump"
  pg_restore --clean --if-exists -d "$STAGING_RESTORE_SCRATCH_URL" "artifacts/backup_staging_pre_gate3b.dump"
  ```

- [ ] **3. Redis Namespace Isolation**:
  Verify staging connects to an isolated Redis instance or dedicated database index (e.g., `REDIS_URL="redis://<host>:6379/2"`). Staging MUST NOT share database `0` with development or production to prevent worker queue collision (`company-invitations`, outbox worker) and rate-limit throttle interference.

- [ ] **4. Mailbox & External Side Effects Killswitch**:
  Verify the background sync killswitch is active:
  ```powershell
  $env:FEATURE_MAILBOX_SYNC_ENABLED = "false"
  $env:BREVO_SMTP_HOST = "127.0.0.1"
  $env:BREVO_SMTP_PORT = "1025"
  ```
  Runtime enforcement: `backend/src/jobs/mailbox-sync.job.js` checks `featureFlags.mailboxSyncEnabled` and halts timer initialization when false.

- [ ] **5. Active Connection & Lock Preflight**:
  Verify active connections and ensure no long-running analytical queries hold locks:
  ```sql
  SELECT pid, now() - xact_start AS duration, query, state
  FROM pg_stat_activity
  WHERE state != 'idle' AND (now() - xact_start) > interval '3 seconds'
  ORDER BY duration DESC;
  ```

---

## 3. Step-by-Step Execution Protocol (Gate 3)

### Step 3A: Static Schema Validation & Target Preflight
Run statically to confirm schema syntax, AST integrity, and database target:
```powershell
# Windows PowerShell
cd backend
npx prisma validate
npx prisma generate
node scripts/verify_target_db.js --mode=staging
```
*Expected Result*: `The schema is valid.`, Prisma Client generated, and target confirmed as `EXPECTED_TARGET_DB`.

---

### Step 3B: Apply Transactional Migration
Apply the additive transactional schema migration:
```powershell
npx prisma migrate deploy
```
*Applied File*: `backend/prisma/migrations/20261029000000_phase2a_expand_schema/migration.sql`

#### What this migration executes:
1. Sets `SET lock_timeout = '3s';`.
2. Adds nullable columns:
   - `Assessment.companyId` (TEXT, NULL)
   - `Assessment.isQuarantined` (BOOLEAN, DEFAULT false)
   - `Invitation.companyId` (TEXT, NULL)
   - `CandidateAttempt.companyId` (TEXT, NULL)
   - `UserMailbox.companyId` (TEXT, NULL)
3. Creates `AssessmentQuarantineLog` and `QuarantineResolutionEvent` tables.
4. Creates non-blocking indexes for newly created quarantine tables:
   - `AssessmentQuarantineLog_assessmentId_idx`
   - `AssessmentQuarantineLog_quarantinedAt_idx`
   - `QuarantineResolutionEvent_quarantineLogId_idx`
   - `QuarantineResolutionEvent_resolvedAt_idx`
5. Binds `prevent_quarantine_log_mutation()` immutability triggers (intercepting `UPDATE`, `DELETE`, and statement-level `TRUNCATE`) to both quarantine tables.
6. Adds foreign keys to `Company(id)` with `NOT VALID` (zero full-table blocking locks).

#### Operational Failure & Retry:
- If PostgreSQL aborts with error `55P03` (`lock_not_available`), active transactions held a lock on `Assessment` for $> 3$ seconds.
- **Action**: Do not increase `lock_timeout`. Identify blocking PIDs using the active connection query above, wait for them to finish, and re-run `npx prisma migrate deploy`.

---

### Step 3C: Execute Non-Transactional Concurrent Index Runner
Execute the standalone index and constraint runner (automatically invokes `verifyTargetDatabase()`):
```powershell
node scripts/run_concurrent_indexes.js
```

#### What this runner executes:
1. Executes `verifyTargetDatabase()`: fails closed if target DB does not match `EXPECTED_TARGET_DB` or connects to production/dev.
2. Discretely executes `CREATE INDEX CONCURRENTLY IF NOT EXISTS` for all 6 reconciled indexes:
   - `idx_assessment_id_company` (UNIQUE) on `Assessment(id, companyId)`
   - `idx_assessment_company_status` on `Assessment(companyId, status)`
   - `idx_assessment_is_quarantined` on `Assessment(isQuarantined)`
   - `idx_invitation_company` on `Invitation(companyId)`
   - `idx_candidate_attempt_company` on `CandidateAttempt(companyId)`
   - `idx_user_mailbox_company` on `UserMailbox(companyId)`
3. Automatically detects and drops broken indexes (`pg_index.indisvalid = false`) before re-attempting creation.
4. Inspects catalog index definition, uniqueness, and ordered columns. If a valid index exists with a mismatched definition, **halts safely without mutating data** to allow DBA manual review.
5. Performs preflight duplicate key checks before building unique indexes.
6. Validates all deferred foreign keys using `ALTER TABLE ... VALIDATE CONSTRAINT` (takes lightweight `ShareUpdateExclusiveLock`).

#### Verification Query:
Verify all newly created concurrent indexes are valid:
```sql
SELECT 
    i.relname AS index_name,
    t.relname AS table_name,
    ix.indisvalid,
    ix.indisunique,
    pg_get_indexdef(ix.indexrelid) AS index_def
FROM pg_class t
JOIN pg_index ix ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' 
  AND i.relname IN (
    'idx_assessment_id_company',
    'idx_assessment_company_status',
    'idx_assessment_is_quarantined',
    'idx_invitation_company',
    'idx_candidate_attempt_company',
    'idx_user_mailbox_company'
  );
```
*Expected Result*: All 6 rows must report `indisvalid = true`.

---

### Step 3D: Execute Read-Only Historical Assessment Classification
Execute the dry-run classification script against unassigned records (invokes `verifyTargetDatabase()`):
```powershell
node scripts/dry_run_tenant_classification.js --output=artifacts/classification_report.json
```

#### Classification Policy:
- **`AUTHORITATIVE`**: Direct entity binding (proprietary questions or candidate pool) matches verified creator membership. Eligible for backfill review in Phase 2B.
- **`HEURISTIC_MATCH`**: Creator belongs to exactly one company, but lacks direct entity binding. Requires explicit recruiter confirmation before assignment.
- **`MULTI_TENANT_AMBIGUOUS`**: Conflicting tenant signals. Records are quarantined (`isQuarantined = true`) with diagnostic evidence logged to `AssessmentQuarantineLog`. No live mutations.
- **`UNASSIGNABLE`**: Creator belongs to zero companies. Records remain unassigned and quarantined.

---

### Step 3E: Run Staging Scaffolding Test Suites
Run the staging contract and classification test suites:
```powershell
node --test tests/staging/phase2a-schema-migration.test.js
node --test tests/staging/phase2a-concurrent-indexes.test.js
node --test tests/staging/phase2a-classification.test.js
```
*Expected Result*: All tests pass with zero failures.

---

## 4. Rollback & Emergency Procedures

### Scenario A: Transactional Migration Fails During `migrate deploy`
- **Impact**: Zero schema mutation. The migration runs inside a single transaction block; if aborted by `lock_timeout`, PostgreSQL rolls back automatically.
- **Recovery**: Review blocking locks, terminate long-running transactions, and retry during off-peak maintenance window.

### Scenario B: Concurrent Index Build Fails or Leaves Invalid Index
- **Impact**: Index marked `indisvalid = false`. Consumes disk but does not affect application traffic.
- **Recovery**: Run `node scripts/run_concurrent_indexes.js`. The runner will detect `indisvalid = false`, issue `DROP INDEX CONCURRENTLY IF EXISTS`, and rebuild the index cleanly.

### Scenario C: Runner Flags Index Definition Mismatch Error
- **Impact**: Runner halts with `IndexDefinitionMismatchError` without touching existing index.
- **Recovery**: Inspect catalog definition using `SELECT pg_get_indexdef('...'::regclass);`. If the existing index is legacy/obsolete, drop it manually after verifying zero caller dependencies, then re-run the runner.

### Scenario D: Constraint Validation Fails (`VALIDATE CONSTRAINT`)
- **Impact**: Existing rows violate the foreign key constraint. The table remains readable and writable because `NOT VALID` was used during creation.
- **Recovery**: Inspect orphaned records using:
  ```sql
  SELECT id, "companyId" FROM "Assessment" 
  WHERE "companyId" IS NOT NULL 
    AND "companyId" NOT IN (SELECT id FROM "Company");
  ```
  Set orphaned `companyId` to `NULL` and re-run the runner.

### Scenario E: Target Database Identity Mismatch
- **Impact**: `verify_target_db.js` halts with `TargetDatabaseSafetyError` before any query or migration executes.
- **Recovery**: Check `$env:DATABASE_URL`, `$env:DIRECT_URL`, and `$env:EXPECTED_TARGET_DB`. Ensure all point to the authorized staging database. Never use production or development connection strings.

### Scenario F: Quarantine Table Immutability Trigger Rejection
- **Impact**: Any `UPDATE`, `DELETE`, or `TRUNCATE` against `AssessmentQuarantineLog` or `QuarantineResolutionEvent` throws exception `prevent_quarantine_log_mutation()`.
- **Recovery**: Do not attempt to delete quarantine rows. Resolve ambiguous records via `QuarantineResolutionEvent` (append-only), or restore the staging database from the Step 2 snapshot if resetting test data.

### Scenario G: Mailbox Worker Accidental Activation
- **Impact**: Recruiter mailboxes attempt syncing without proper tenant authorization.
- **Recovery**:
  1. Confirm `FEATURE_MAILBOX_SYNC_ENABLED=false` in environment variables.
  2. Restart the backend service.
  3. Verify logs show `[MailboxSyncJob] Mailbox sync scheduler not started: Kill switch engaged`.

---

## 5. Gate Progression Sign-Off Checklist

- [ ] All safety prerequisites implemented: `verify_target_db.js`, scoped `test-db.js`, fail-closed `test-env.js`.
- [ ] Database identity preflight confirmed (`EXPECTED_TARGET_DB="hirequest_staging"`).
- [ ] Staging database snapshot and restore rehearsal completed.
- [ ] Redis staging namespace verified (`REDIS_URL` uses dedicated DB index).
- [ ] Mailbox killswitch verified (`FEATURE_MAILBOX_SYNC_ENABLED=false`).
- [ ] Schema validation and migration applied cleanly on staging clone.
- [ ] All 6 concurrent indexes confirmed valid (`indisvalid = true`).
- [ ] All 4 quarantine audit indexes confirmed created.
- [ ] All 5 foreign key constraints validated.
- [ ] Classification report reviewed and signed off.
- [ ] Staging test suites passed 100%.
- [ ] Ready for Gate 2B Application Code Changes.

