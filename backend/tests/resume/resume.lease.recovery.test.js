"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const resumeService = require("../../src/modules/resume/resume.service");
const repository = require("../../src/modules/resume/resume.repository");
const parserService = require("../../src/modules/resume/resume.parser.service");
const { prisma } = require("../../src/config/prisma");

describe("Resume Processing Lease, Heartbeat & Stale Recovery Suite", () => {
  let origFindResumeByHash;
  let origFindResumeProcessingById;
  let origCreateResumeProcessing;
  let origCreateResumeProcessingSafely;
  let origUpdateResumeProcessing;
  let origTouchResumeProcessing;
  let origClaimStaleResumeProcessing;
  let origParseResume;
  let origFindCandidate;
  let origCreateCandidate;
  let origEnsureProfile;
  let origPrismaTransaction;
  let origFindFirstMember;

  const store = {
    resumes: new Map(),
    users: new Map(),
    profiles: new Map(),
    touchCallCount: 0,
    claimCallCount: 0,
  };

  const validPdfBuffer = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n% unique"
  );

  beforeEach(() => {
    origFindResumeByHash = repository.findResumeByHash;
    origFindResumeProcessingById = repository.findResumeProcessingById;
    origCreateResumeProcessing = repository.createResumeProcessing;
    origCreateResumeProcessingSafely = repository.createResumeProcessingSafely;
    origUpdateResumeProcessing = repository.updateResumeProcessing;
    origTouchResumeProcessing = repository.touchResumeProcessing;
    origClaimStaleResumeProcessing = repository.claimStaleResumeProcessing;
    origParseResume = parserService.parseResume;
    origFindCandidate = repository.findCandidateByEmail;
    origCreateCandidate = repository.createCandidate;
    origEnsureProfile = repository.ensureCandidateProfile;
    origPrismaTransaction = prisma.$transaction;
    origFindFirstMember = prisma.companyMember?.findFirst;

    prisma.$transaction = async (fn) => fn(prisma);
    if (prisma.companyMember) {
      prisma.companyMember.findFirst = async () => null;
    }

    store.resumes.clear();
    store.users.clear();
    store.profiles.clear();
    store.touchCallCount = 0;
    store.claimCallCount = 0;

    repository.findResumeByHash = async (hash) => {
      return store.resumes.get(hash) || null;
    };

    repository.findResumeProcessingById = async (id) => {
      for (const r of store.resumes.values()) {
        if (r.id === id) return r;
      }
      return null;
    };

    repository.createResumeProcessing = async (data) => {
      const item = {
        id: "rp_" + Math.random().toString(36).slice(2, 8),
        ...data,
        status: data.status || "PENDING",
        createdAt: new Date(),
        updatedAt: new Date(),
        applications: [],
      };
      store.resumes.set(data.fileHash, item);
      return item;
    };

    repository.createResumeProcessingSafely = async (data) => {
      if (store.resumes.has(data.fileHash)) {
        return store.resumes.get(data.fileHash);
      }
      return repository.createResumeProcessing(data);
    };

    repository.updateResumeProcessing = async (id, data) => {
      for (const r of store.resumes.values()) {
        if (r.id === id) {
          Object.assign(r, data, { updatedAt: new Date() });
          return r;
        }
      }
      return { id, ...data };
    };

    repository.touchResumeProcessing = async (id) => {
      store.touchCallCount++;
      for (const r of store.resumes.values()) {
        if (r.id === id) {
          r.updatedAt = new Date();
          return r;
        }
      }
      return null;
    };

    repository.claimStaleResumeProcessing = async (id, staleBefore) => {
      store.claimCallCount++;
      for (const r of store.resumes.values()) {
        if (r.id === id) {
          const isStale =
            r.status === "FAILED" ||
            r.status === "PENDING" ||
            (r.status === "PROCESSING" &&
              new Date(r.updatedAt).getTime() < new Date(staleBefore).getTime());

          if (isStale) {
            r.status = "PROCESSING";
            r.updatedAt = new Date();
            r.errorCode = null;
            r.errorMessage = null;
            return true;
          }
          return false;
        }
      }
      return false;
    };

    parserService.parseResume = async () => ({
      status: "SUCCESS",
      text: "Senior Software Engineer with JavaScript, Node.js, PostgreSQL, Docker, Redis",
      extractedData: {
        name: "Test Candidate",
        email: "candidate@example.com",
        skills: ["JavaScript", "Node.js", "PostgreSQL"],
      },
    });

    repository.findCandidateByEmail = async (email) => {
      return store.users.get(email) || null;
    };

    repository.createCandidate = async (data) => {
      const user = { id: "usr_" + Math.random().toString(36).slice(2, 8), ...data };
      store.users.set(data.email, user);
      return user;
    };

    repository.ensureCandidateProfile = async (user, data, companyId) => {
      const prof = { id: "prof_" + Math.random().toString(36).slice(2, 8), userId: user.id, companyId };
      store.profiles.set(user.email, prof);
      return prof;
    };
  });

  afterEach(() => {
    repository.findResumeByHash = origFindResumeByHash;
    repository.findResumeProcessingById = origFindResumeProcessingById;
    repository.createResumeProcessing = origCreateResumeProcessing;
    repository.createResumeProcessingSafely = origCreateResumeProcessingSafely;
    repository.updateResumeProcessing = origUpdateResumeProcessing;
    repository.touchResumeProcessing = origTouchResumeProcessing;
    repository.claimStaleResumeProcessing = origClaimStaleResumeProcessing;
    parserService.parseResume = origParseResume;
    repository.findCandidateByEmail = origFindCandidate;
    repository.createCandidate = origCreateCandidate;
    repository.ensureCandidateProfile = origEnsureProfile;
    prisma.$transaction = origPrismaTransaction;
    if (prisma.companyMember) prisma.companyMember.findFirst = origFindFirstMember;
  });

  it("active job lasting longer than 5 minutes is NOT reclaimed when heartbeat is active", async () => {
    const fileHash = resumeService.calculateSha256(validPdfBuffer);
    // Simulate an existing job created 6 minutes ago, but heartbeat kept updatedAt fresh (10 seconds ago)
    const activeRecord = {
      id: "rp_active_01",
      fileHash,
      fileName: "long_resume.pdf",
      fileType: "PDF",
      mimeType: "application/pdf",
      fileSize: validPdfBuffer.length,
      storageKey: `resumes/${fileHash.slice(0, 2)}/${fileHash}.pdf`,
      status: "PROCESSING",
      createdAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
      updatedAt: new Date(Date.now() - 10 * 1000),      // 10 seconds ago (active heartbeat)
      candidateId: null,
      applications: [],
    };
    store.resumes.set(fileHash, activeRecord);

    const result = await resumeService.processResume({
      file: {
        buffer: validPdfBuffer,
        originalname: "long_resume.pdf",
        mimetype: "application/pdf",
        size: validPdfBuffer.length,
      },
      source: "DIRECT_UPLOAD",
    });

    // Second worker MUST identify it as an active duplicate and NOT claim it
    assert.equal(result.duplicate, true, "Must be classified as duplicate");
    assert.equal(store.claimCallCount, 0, "Must not attempt to claim an active job");
    assert.equal(activeRecord.status, "PROCESSING", "Active job status must remain PROCESSING");
  });

  it("genuinely crashed job exceeding 5 minutes IS reclaimed and recovered", async () => {
    const fileHash = resumeService.calculateSha256(validPdfBuffer);
    // Simulate a crashed job from 6 minutes ago with NO heartbeat (updatedAt is 6 minutes old)
    const crashedRecord = {
      id: "rp_crashed_02",
      fileHash,
      fileName: "crashed_resume.pdf",
      fileType: "PDF",
      mimeType: "application/pdf",
      fileSize: validPdfBuffer.length,
      storageKey: `resumes/${fileHash.slice(0, 2)}/${fileHash}.pdf`,
      status: "PROCESSING",
      createdAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
      updatedAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago (dead heartbeat)
      candidateId: null,
      applications: [],
    };
    store.resumes.set(fileHash, crashedRecord);

    const result = await resumeService.processResume({
      file: {
        buffer: validPdfBuffer,
        originalname: "crashed_resume.pdf",
        mimetype: "application/pdf",
        size: validPdfBuffer.length,
      },
      source: "DIRECT_UPLOAD",
    });

    assert.equal(result.duplicate, false, "Must reclaim and process as new/recovered");
    assert.equal(store.claimCallCount, 1, "Must invoke claimStaleResumeProcessing");
    assert.equal(crashedRecord.status, "COMPLETED", "Recovered record must transition to COMPLETED");
  });

  it("atomic claim race condition: exactly one worker claims stale job while second worker yields", async () => {
    const fileHash = "hash_concurrent_claim_03";
    const staleRecord = {
      id: "rp_stale_03",
      fileHash,
      fileName: "stale_resume.pdf",
      fileType: "PDF",
      mimeType: "application/pdf",
      fileSize: validPdfBuffer.length,
      storageKey: "resumes/ha/hash_concurrent_claim_03.pdf",
      status: "PROCESSING",
      createdAt: new Date(Date.now() - 10 * 60 * 1000),
      updatedAt: new Date(Date.now() - 10 * 60 * 1000),
      candidateId: null,
      applications: [],
    };
    store.resumes.set(fileHash, staleRecord);

    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);

    // Worker 1 and Worker 2 both attempt to claim atomically
    const claim1 = await repository.claimStaleResumeProcessing(staleRecord.id, staleBefore);
    const claim2 = await repository.claimStaleResumeProcessing(staleRecord.id, staleBefore);

    assert.equal(claim1, true, "Worker 1 must win ownership");
    assert.equal(claim2, false, "Worker 2 must lose ownership because updatedAt was updated");
    assert.equal(store.claimCallCount, 2, "Both claim calls must execute");
  });

  it("heartbeat timer fires during processing and touches updatedAt", async () => {
    // Set heartbeat interval very low for test
    process.env.RESUME_HEARTBEAT_INTERVAL_MS = "25";

    // Simulate parser with artificial delay of 70ms to allow ~2 heartbeats
    parserService.parseResume = async () => {
      await new Promise((resolve) => setTimeout(resolve, 70));
      return {
        status: "SUCCESS",
        text: "Senior Software Engineer with JavaScript, Node.js, PostgreSQL, Docker, Redis",
        extractedData: {
          name: "Heartbeat Candidate",
          email: "heartbeat@example.com",
          skills: ["JavaScript", "Node.js", "PostgreSQL"],
        },
      };
    };

    try {
      const result = await resumeService.processResume({
        file: {
          buffer: validPdfBuffer,
          originalname: "heartbeat_resume.pdf",
          mimetype: "application/pdf",
          size: validPdfBuffer.length,
        },
        source: "DIRECT_UPLOAD",
      });

      assert.equal(result.duplicate, false);
      assert.ok(store.touchCallCount >= 1, `Heartbeat must fire at least once (fired: ${store.touchCallCount})`);
    } finally {
      delete process.env.RESUME_HEARTBEAT_INTERVAL_MS;
    }
  });
});
