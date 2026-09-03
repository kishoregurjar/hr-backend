"use strict";

const toAttemptAuditDto = (audit) => {
  if (!audit) return null;

  return {
    id: audit.id,
    event: audit.event,

    attemptId: audit.attemptId,
    candidateId: audit.candidateId,
    assessmentId: audit.assessmentId,
    questionId: audit.questionId,

    metadata: audit.metadata,

    ipAddress: audit.ipAddress,
    userAgent: audit.userAgent,

    createdAt: audit.createdAt,
  };
};

const toAttemptAuditListDto = (logs) => {
  if (!Array.isArray(logs)) return [];
  return logs.map(toAttemptAuditDto);
};

module.exports = {
  toAttemptAuditDto,
  toAttemptAuditListDto,
};
