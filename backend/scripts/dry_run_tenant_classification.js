"use strict";

/**
 * =============================================================================
 * HireQuest Phase 2A — Read-Only Historical Assessment Tenant Classifier
 * File: backend/scripts/dry_run_tenant_classification.js
 * =============================================================================
 * Operational Requirements & Invariants:
 * 1. STRICTLY READ-ONLY: Executes zero INSERT, UPDATE, or DELETE statements.
 * 2. Does NOT perform automatic ownership assignment.
 * 3. Creator membership alone is heuristic evidence, NEVER authoritative ownership.
 * 4. Authoritative classification requires deterministic entity linkage:
 *    - All company-linked Questions match the company AND creator is a member.
 *    - Or all company-linked Candidates match the company AND creator is a member.
 * 5. Ambiguous records (multi-company creator, conflicting question/candidate tenants)
 *    are classified as MULTI_TENANT_AMBIGUOUS for quarantine and human review.
 * 6. Records with zero company associations are classified as UNASSIGNABLE.
 * =============================================================================
 */

const fs = require("node:fs");
const path = require("node:path");
const { prisma } = require("../src/config/prisma");
const { verifyTargetDatabase } = require("./verify_target_db");

const CLASSIFICATION_TIERS = {
  AUTHORITATIVE: "AUTHORITATIVE",
  HEURISTIC_MATCH: "HEURISTIC_MATCH",
  MULTI_TENANT_AMBIGUOUS: "MULTI_TENANT_AMBIGUOUS",
  UNASSIGNABLE: "UNASSIGNABLE",
};

/**
 * Classifies an individual assessment record based on collected evidence.
 */
function classifyAssessmentRecord({
  assessment,
  creatorMemberships,
  questionCompanyIds,
  candidateCompanyIds,
}) {
  const creatorCompanyIds = creatorMemberships.map((m) => m.companyId);
  const evidence = {
    creatorId: assessment.createdById,
    creatorCompanyCount: creatorCompanyIds.length,
    creatorCompanyIds,
    questionCompanyCount: questionCompanyIds.length,
    questionCompanyIds,
    candidateCompanyCount: candidateCompanyIds.length,
    candidateCompanyIds,
  };

  // Case 1: Multiple conflicting question company associations
  if (questionCompanyIds.length > 1) {
    return {
      assessmentId: assessment.id,
      title: assessment.title,
      status: assessment.status,
      tier: CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS,
      recommendedCompanyId: null,
      reason: "Assessment contains proprietary questions belonging to multiple distinct companies.",
      evidence,
    };
  }

  // Case 2: Multiple conflicting candidate company associations
  if (candidateCompanyIds.length > 1) {
    return {
      assessmentId: assessment.id,
      title: assessment.title,
      status: assessment.status,
      tier: CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS,
      recommendedCompanyId: null,
      reason: "Assessment has candidate invitations associated with multiple distinct companies.",
      evidence,
    };
  }

  const singleQuestionCompany = questionCompanyIds[0] || null;
  const singleCandidateCompany = candidateCompanyIds[0] || null;

  // Case 3: Conflicting question vs candidate company
  if (
    singleQuestionCompany &&
    singleCandidateCompany &&
    singleQuestionCompany !== singleCandidateCompany
  ) {
    return {
      assessmentId: assessment.id,
      title: assessment.title,
      status: assessment.status,
      tier: CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS,
      recommendedCompanyId: null,
      reason: `Question company (${singleQuestionCompany}) conflicts with candidate company (${singleCandidateCompany}).`,
      evidence,
    };
  }

  const primaryEntityCompany = singleQuestionCompany || singleCandidateCompany;

  // Case 4: Authoritative match — Direct entity binding + creator is a member
  if (primaryEntityCompany) {
    if (creatorCompanyIds.includes(primaryEntityCompany)) {
      return {
        assessmentId: assessment.id,
        title: assessment.title,
        status: assessment.status,
        tier: CLASSIFICATION_TIERS.AUTHORITATIVE,
        recommendedCompanyId: primaryEntityCompany,
        reason: "Authoritative direct entity binding: Question/candidate tenant matches verified creator membership.",
        evidence,
      };
    } else {
      // Entity belongs to Company X, but creator is NOT a member of Company X
      return {
        assessmentId: assessment.id,
        title: assessment.title,
        status: assessment.status,
        tier: CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS,
        recommendedCompanyId: null,
        reason: `Entity belongs to company ${primaryEntityCompany}, but creator is not an active member of that company.`,
        evidence,
      };
    }
  }

  // Case 5: No direct question/candidate entity binding exists
  // Evaluate creator memberships
  if (creatorCompanyIds.length === 0) {
    return {
      assessmentId: assessment.id,
      title: assessment.title,
      status: assessment.status,
      tier: CLASSIFICATION_TIERS.UNASSIGNABLE,
      recommendedCompanyId: null,
      reason: "Orphaned assessment: Creator has zero active company memberships and no entity bindings exist.",
      evidence,
    };
  }

  if (creatorCompanyIds.length === 1) {
    return {
      assessmentId: assessment.id,
      title: assessment.title,
      status: assessment.status,
      tier: CLASSIFICATION_TIERS.HEURISTIC_MATCH,
      recommendedCompanyId: creatorCompanyIds[0],
      reason: "Heuristic match: Creator belongs to exactly one company, but no direct entity binding exists.",
      evidence,
    };
  }

  // Creator belongs to 2 or more companies with no entity binding to disambiguate
  return {
    assessmentId: assessment.id,
    title: assessment.title,
    status: assessment.status,
    tier: CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS,
    recommendedCompanyId: null,
    reason: `Multi-tenant ambiguous: Creator belongs to ${creatorCompanyIds.length} companies without entity linkage to disambiguate.`,
    evidence,
  };
}

async function runClassificationDryRun(options = {}) {
  console.log(`=============================================================================`);
  console.log(`HireQuest Phase 2A — Historical Assessment Tenant Classification (DRY-RUN)`);
  console.log(`Mode: STRICTLY READ-ONLY (No database writes)`);
  console.log(`=============================================================================\n`);

  // Query unassigned assessments (or all if specified)
  const whereClause = options.includeAssigned ? {} : { companyId: null };
  const assessments = await prisma.assessment.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      status: true,
      createdById: true,
      createdAt: true,
      questions: {
        select: {
          question: {
            select: {
              companyId: true,
            },
          },
        },
      },
      invitations: {
        select: {
          candidate: {
            select: {
              companyCandidates: {
                select: {
                  companyId: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Found ${assessments.length} assessment records to evaluate.\n`);

  if (assessments.length === 0) {
    console.log(`No unassigned assessment records found. Classification complete.`);
    return {
      total: 0,
      breakdown: {
        [CLASSIFICATION_TIERS.AUTHORITATIVE]: 0,
        [CLASSIFICATION_TIERS.HEURISTIC_MATCH]: 0,
        [CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS]: 0,
        [CLASSIFICATION_TIERS.UNASSIGNABLE]: 0,
      },
      results: [],
    };
  }

  // Pre-fetch creator company memberships in batch
  const uniqueCreatorIds = [...new Set(assessments.map((a) => a.createdById))];
  const companyMemberships = await prisma.companyMember.findMany({
    where: { userId: { in: uniqueCreatorIds } },
    select: { userId: true, companyId: true, role: true },
  });

  const membershipMap = new Map();
  for (const m of companyMemberships) {
    if (!membershipMap.has(m.userId)) {
      membershipMap.set(m.userId, []);
    }
    membershipMap.get(m.userId).push(m);
  }

  const results = [];
  const breakdown = {
    [CLASSIFICATION_TIERS.AUTHORITATIVE]: 0,
    [CLASSIFICATION_TIERS.HEURISTIC_MATCH]: 0,
    [CLASSIFICATION_TIERS.MULTI_TENANT_AMBIGUOUS]: 0,
    [CLASSIFICATION_TIERS.UNASSIGNABLE]: 0,
  };

  for (const assessment of assessments) {
    const creatorMemberships = membershipMap.get(assessment.createdById) || [];

    // Extract unique non-null question companyIds
    const questionCompanyIds = [
      ...new Set(
        assessment.questions
          .map((q) => q.question.companyId)
          .filter(Boolean)
      ),
    ];

    // Extract unique candidate companyIds
    const candidateCompanyIds = [
      ...new Set(
        assessment.invitations
          .flatMap((inv) => inv.candidate.companyCandidates.map((cc) => cc.companyId))
          .filter(Boolean)
      ),
    ];

    const classification = classifyAssessmentRecord({
      assessment,
      creatorMemberships,
      questionCompanyIds,
      candidateCompanyIds,
    });

    results.push(classification);
    breakdown[classification.tier]++;
  }

  // Output Summary Table
  console.log(`-----------------------------------------------------------------------------`);
  console.log(`CLASSIFICATION BREAKDOWN SUMMARY`);
  console.log(`-----------------------------------------------------------------------------`);
  console.table(
    Object.entries(breakdown).map(([tier, count]) => ({
      Tier: tier,
      Count: count,
      Percentage: `${((count / assessments.length) * 100).toFixed(1)}%`,
      ActionPolicy:
        tier === CLASSIFICATION_TIERS.AUTHORITATIVE
          ? "Eligible for backfill review in Phase 2B"
          : tier === CLASSIFICATION_TIERS.HEURISTIC_MATCH
          ? "Requires explicit manual recruiter confirmation"
          : "Remains unassigned & quarantined; no live mutations",
    }))
  );

  // Print sample records
  console.log(`\nSample Classified Records (First 5):`);
  console.log(JSON.stringify(results.slice(0, 5), null, 2));

  // Write full report to file if flag provided
  if (options.outputPath) {
    const resolvedPath = path.resolve(process.cwd(), options.outputPath);
    const reportData = {
      timestamp: new Date().toISOString(),
      totalEvaluated: assessments.length,
      breakdown,
      results,
    };
    fs.writeFileSync(resolvedPath, JSON.stringify(reportData, null, 2), "utf8");
    console.log(`\nFull classification report saved to: ${resolvedPath}`);
  }

  return {
    total: assessments.length,
    breakdown,
    results,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const outputArg = args.find((a) => a.startsWith("--output="));
  const outputPath = outputArg ? outputArg.split("=")[1] : null;
  const includeAssigned = args.includes("--all");
  const allowDev = args.includes("--allow-dev") || process.env.ALLOW_DEV_EXECUTION === "true";
  const modeArg = args.find((a) => a.startsWith("--mode="));
  const mode = modeArg ? modeArg.split("=")[1] : (process.env.TARGET_ENVIRONMENT || "staging");

  // Step 0: Fail-closed target database preflight verification
  await verifyTargetDatabase({ mode, allowDev });

  await runClassificationDryRun({ outputPath, includeAssigned });
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("\n[CLASSIFIER FAILURE]", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = {
  CLASSIFICATION_TIERS,
  classifyAssessmentRecord,
  runClassificationDryRun,
  main,
};
