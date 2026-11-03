"use strict";

const { AppError } = require("../../utils/app-error");
const repository = require("./assessment.result.repository");
const { ASSESSMENT_RESULT_CONSTANTS } = require("./assessment.result.constants");

const { prisma } = require("../../config/prisma");

async function getCandidateResult({ candidateId, candidateAssessmentId }) {
  const data = await repository.findCandidateResult({
    candidateAssessmentId,
    candidateId,
  });

  if (!data) {
    throw new AppError("Assessment result not found.", {
      statusCode: 404,
      code: ASSESSMENT_RESULT_CONSTANTS.ERROR_CODES.RESULT_NOT_FOUND,
    });
  }

  const result = data.assessmentResult || data.result;
  if (!result) {
    throw new AppError("Assessment result is not available yet.", {
      statusCode: 409,
      code: ASSESSMENT_RESULT_CONSTANTS.ERROR_CODES.RESULT_NOT_READY,
    });
  }

  return data;
}

async function getAssessmentResults({ assessmentId, query, companyId = null, user = null }) {
  const assessment = await repository.findAssessmentById(assessmentId);
  if (!assessment) {
    throw new AppError("Assessment not found.", {
      statusCode: 404,
      code: ASSESSMENT_RESULT_CONSTANTS.ERROR_CODES.RESULT_NOT_FOUND,
    });
  }

  if (assessment.isQuarantined && user?.role !== "SUPER_ADMIN") {
    throw new AppError("Assessment is temporarily quarantined under administrative review.", {
      statusCode: 403,
      code: "ASSESSMENT_QUARANTINED",
    });
  }

  if (user?.role !== "SUPER_ADMIN") {
    if (assessment.companyId) {
      if (!companyId || assessment.companyId !== companyId) {
        throw new AppError("You do not have access to this assessment.", {
          statusCode: 403,
          code: "FORBIDDEN",
        });
      }
    } else {
      // Legacy unassigned assessment: companyId is required and must match creator's company membership
      if (!companyId) {
        throw new AppError("Active company context (X-Company-Id header) is required to access assessment results.", {
          statusCode: 400,
          code: "COMPANY_CONTEXT_REQUIRED",
        });
      }
      if (assessment.createdById) {
        const creatorMember = await prisma.companyMember.findUnique({
          where: {
            companyId_userId: {
              companyId,
              userId: assessment.createdById,
            },
          },
        });
        if (!creatorMember) {
          throw new AppError("You do not have access to this legacy assessment.", {
            statusCode: 403,
            code: "FORBIDDEN",
          });
        }
      }
    }
  }

  return repository.findAssessmentResults({
    assessmentId,
    status: query.status,
    search: query.search,
    page: query.page,
    limit: query.limit,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  });
}

async function getResultDetails(params) {
  const candidateAssessmentId = typeof params === "string" ? params : params?.candidateAssessmentId;
  const companyId = typeof params === "object" ? params.companyId : null;
  const user = typeof params === "object" ? params.user : null;

  const result = await repository.findResultDetails(candidateAssessmentId);

  if (!result) {
    throw new AppError("Assessment result not found.", {
      statusCode: 404,
      code: ASSESSMENT_RESULT_CONSTANTS.ERROR_CODES.RESULT_NOT_FOUND,
    });
  }

  if (result.assessment?.isQuarantined && user?.role !== "SUPER_ADMIN") {
    throw new AppError("Assessment is temporarily quarantined under administrative review.", {
      statusCode: 403,
      code: "ASSESSMENT_QUARANTINED",
    });
  }

  if (user?.role !== "SUPER_ADMIN") {
    const assessmentCompanyId = result.assessment?.companyId;
    if (assessmentCompanyId) {
      if (!companyId || assessmentCompanyId !== companyId) {
        throw new AppError("You do not have access to this assessment result.", {
          statusCode: 403,
          code: "FORBIDDEN",
        });
      }
    } else {
      // Legacy unassigned assessment: companyId is required and must match creator's company membership
      if (!companyId) {
        throw new AppError("Active company context (X-Company-Id header) is required to access assessment results.", {
          statusCode: 400,
          code: "COMPANY_CONTEXT_REQUIRED",
        });
      }
      if (result.assessment?.createdById) {
        const creatorMember = await prisma.companyMember.findUnique({
          where: {
            companyId_userId: {
              companyId,
              userId: result.assessment.createdById,
            },
          },
        });
        if (!creatorMember) {
          throw new AppError("You do not have access to this legacy assessment result.", {
            statusCode: 403,
            code: "FORBIDDEN",
          });
        }
      }
    }
  }

  const res = result.assessmentResult || result.result;
  if (!res) {
    throw new AppError("Assessment has not been finalized.", {
      statusCode: 409,
      code: ASSESSMENT_RESULT_CONSTANTS.ERROR_CODES.RESULT_NOT_READY,
    });
  }

  return result;
}

async function getCandidateAttempts({ candidateId, candidateAssessmentId }) {
  return repository.findCandidateAttempts({
    candidateId,
    candidateAssessmentId,
  });
}

module.exports = {
  getCandidateResult,
  getAssessmentResults,
  getResultDetails,
  getCandidateAttempts,
};
