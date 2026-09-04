"use strict";

function createResumeController({ service }) {
  if (!service) {
    throw new Error("RESUME_SERVICE_REQUIRED");
  }

  async function parseUpload(req, res, next) {
    try {
      const result = await service.parseUploadedResume({
        file: req.file,
      });

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }

  async function upload(req, res, next) {
    try {
      const result = await service.processUploadedResume({
        file: req.file,
        jobId: req.body.jobId,
        candidateId: req.body.candidateId,
      });

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }

  async function getCandidateResume(req, res, next) {
    try {
      const candidate = await service.getCandidateResume(
        req.params.candidateId
      );

      return res.status(200).json({
        success: true,
        data: candidate,
      });
    } catch (error) {
      return next(error);
    }
  }

  async function inboundEmail(req, res, next) {
    try {
      const result = await service.processInboundEmail(req);

      return res.status(202).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return next(error);
    }
  }

  return Object.freeze({
    parseUpload,
    upload,
    getCandidateResume,
    inboundEmail,
  });
}

module.exports = {
  createResumeController,
};
