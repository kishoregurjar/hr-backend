"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createResumeController } = require("../../src/modules/resume/resume.controller");

describe("Resume Controller Suite", () => {
  it("rejects request if user is not authenticated", async () => {
    const controller = createResumeController();

    const req = { user: null, query: {} };
    let capturedError = null;
    const next = (err) => { capturedError = err; };

    await controller.uploadResume(req, {}, next);

    assert.ok(capturedError);
    assert.equal(capturedError.code, "AUTHENTICATION_REQUIRED");
    assert.equal(capturedError.statusCode, 401);
  });

  it("rejects upload when req.file is missing", async () => {
    const controller = createResumeController();

    const req = { user: { id: "user_1" }, query: {}, file: null };
    let capturedError = null;
    const next = (err) => { capturedError = err; };

    await controller.uploadResume(req, {}, next);

    assert.ok(capturedError);
    assert.equal(capturedError.code, "RESUME_FILE_REQUIRED");
    assert.equal(capturedError.statusCode, 400);
  });

  it("returns 201 for fresh upload success", async () => {
    const mockService = {
      processResume: async () => ({
        duplicate: false,
        candidateId: "cand_1",
        resumeProcessing: { id: "res_1", status: "COMPLETED" },
        application: null,
      }),
    };

    const controller = createResumeController({ service: mockService });

    const req = {
      user: { id: "user_hr" },
      query: { jobId: "job_1" },
      file: { buffer: Buffer.from("pdf-bytes"), originalname: "resume.pdf" },
    };

    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            jsonResponse = data;
          },
        };
      },
    };

    await controller.uploadResume(req, res, () => {});

    assert.equal(statusCode, 201);
    assert.equal(jsonResponse.success, true);
    assert.equal(jsonResponse.data.duplicate, false);
    assert.equal(jsonResponse.data.candidateId, "cand_1");
  });

  it("returns 200 for duplicate upload", async () => {
    const mockService = {
      processResume: async () => ({
        duplicate: true,
        candidateId: "cand_1",
        resumeProcessing: { id: "res_1", status: "COMPLETED" },
        application: null,
      }),
    };

    const controller = createResumeController({ service: mockService });

    const req = {
      user: { id: "user_hr" },
      query: {},
      file: { buffer: Buffer.from("pdf-bytes"), originalname: "resume.pdf" },
    };

    let statusCode = null;
    let jsonResponse = null;
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (data) => {
            jsonResponse = data;
          },
        };
      },
    };

    await controller.uploadResume(req, res, () => {});

    assert.equal(statusCode, 200);
    assert.equal(jsonResponse.success, true);
    assert.equal(jsonResponse.data.duplicate, true);
  });
});
