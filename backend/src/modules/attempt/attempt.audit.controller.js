"use strict";

const attemptAuditRepository = require("./attempt.audit.repository");
const { toAttemptAuditListDto } = require("./attempt.audit.dto");

const getAttemptAuditLogs = async (req, res, next) => {
  try {
    const { attemptId } = req.params;

    const limit = Math.min(
      Number(req.query.limit) || 50,
      100
    );

    const cursor = req.query.cursor || null;

    const logs = await attemptAuditRepository.findAttemptAuditLogs({
      attemptId,
      limit,
      cursor,
    });

    return res.status(200).json({
      success: true,
      data: toAttemptAuditListDto(logs),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAttemptAuditLogs,
};
