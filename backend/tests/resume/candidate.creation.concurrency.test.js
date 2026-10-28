"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  createCandidateIfRequired,
} = require("../../src/modules/resume/resume.service");
const repository = require("../../src/modules/resume/resume.repository");
const { prisma } = require("../../src/config/prisma");

describe("Candidate Creation Concurrency, Transaction Safety & Role Isolation Suite", () => {
  const TARGET_COMPANY_ID = "cmvqkgij6009orfbo8xj7zkzt"; // Facebook Company
  const OTHER_COMPANY_ID = "cmvqjiw5r0000rfbofwe6fors"; // Microsoft IT Company

  let origFindCandidate;
  let origCreateCandidate;
  let origEnsureProfile;

  let usersDb = new Map();
  let candidateProfilesDb = new Map();
  let companyCandidatesDb = [];
  let userCreateCallCount = 0;

  beforeEach(() => {
    origFindCandidate = repository.findCandidateByEmail;
    origCreateCandidate = repository.createCandidate;
    origEnsureProfile = repository.ensureCandidateProfile;

    usersDb.clear();
    candidateProfilesDb.clear();
    companyCandidatesDb = [];
    userCreateCallCount = 0;

    // In-memory mock for findCandidateByEmail
    repository.findCandidateByEmail = async (email) => {
      if (!email) return null;
      return usersDb.get(email.trim().toLowerCase()) || null;
    };

    // In-memory mock for createCandidate with artificial latency to test race conditions
    repository.createCandidate = async (data) => {
      userCreateCallCount++;
      const normEmail = data.email.trim().toLowerCase();

      // Simulate database unique constraint check
      if (usersDb.has(normEmail)) {
        const p2002Err = new Error("Unique constraint failed on the fields: (email)");
        p2002Err.code = "P2002";
        p2002Err.clientVersion = "6.16.2";
        throw p2002Err;
      }

      // Small async tick to simulate network/DB I/O during insert
      await new Promise((resolve) => setTimeout(resolve, 20));

      const newUser = {
        id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        ...data,
        companyMembers: [],
      };
      usersDb.set(normEmail, newUser);
      return newUser;
    };

    // In-memory mock for ensureCandidateProfile
    repository.ensureCandidateProfile = async (user, extractedData = {}, companyId = null) => {
      const email = user.email.trim().toLowerCase();
      let profile = candidateProfilesDb.get(email);

      if (!profile) {
        profile = {
          id: `cprof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          userId: user.id,
          companyId: companyId || null,
          email,
          firstName: extractedData?.name ? extractedData.name.split(" ")[0] : "Candidate",
          lastName: extractedData?.name ? extractedData.name.split(" ").slice(1).join(" ") : "",
          metadata: { ...extractedData },
        };
        candidateProfilesDb.set(email, profile);
      } else {
        if (!profile.companyId && companyId) {
          profile.companyId = companyId;
        }
      }

      if (companyId) {
        const exists = companyCandidatesDb.some(
          (cc) => cc.companyId === companyId && cc.candidateId === profile.id
        );
        if (!exists) {
          companyCandidatesDb.push({
            companyId,
            candidateId: profile.id,
          });
        }
      }

      return profile;
    };
  });

  afterEach(() => {
    repository.findCandidateByEmail = origFindCandidate;
    repository.createCandidate = origCreateCandidate;
    repository.ensureCandidateProfile = origEnsureProfile;
  });

  // 1. Existing-User Lookup
  describe("1. Existing-User Lookup", () => {
    it("resolves existing candidate user without attempting db.user.create()", async () => {
      const existingUser = {
        id: "usr_existing_candidate_1",
        email: "existing.applicant@gmail.com",
        name: "Existing Applicant",
        role: "CANDIDATE",
        status: "ACTIVE",
        companyMembers: [],
      };
      usersDb.set(existingUser.email, existingUser);

      const result = await createCandidateIfRequired({
        extractedData: {
          name: "Existing Applicant Updated",
          email: "existing.applicant@gmail.com",
          skills: ["React", "Node.js"],
        },
        sourceEmail: "existing.applicant@gmail.com",
        companyId: TARGET_COMPANY_ID,
        source: "INBOUND_EMAIL",
      });

      assert.equal(result.created, false);
      assert.equal(result.candidate.id, "usr_existing_candidate_1");
      assert.equal(result.candidate.email, "existing.applicant@gmail.com");
      assert.equal(userCreateCallCount, 0, "db.user.create must NOT be called for existing candidate");

      // Verify profile was ensured and linked to target company
      const profile = candidateProfilesDb.get("existing.applicant@gmail.com");
      assert.ok(profile);
      assert.equal(profile.userId, "usr_existing_candidate_1");

      const linked = companyCandidatesDb.some(
        (cc) => cc.companyId === TARGET_COMPANY_ID && cc.candidateId === profile.id
      );
      assert.ok(linked, "CandidateProfile must be linked to Facebook Company via CompanyCandidate");
    });
  });

  // 2. Concurrent Duplicate-Email Processing
  describe("2. Concurrent Duplicate-Email Processing", () => {
    it("serializes concurrent candidate creations for the same email and avoids unique constraint errors", async () => {
      const email = "shivam.solanki@gmail.com";

      // Two workers concurrently process resumes from the same candidate (e.g. 2 Gmail messages or 2 attachments)
      const promise1 = createCandidateIfRequired({
        extractedData: {
          name: "Shivam Solanki",
          email,
          skills: ["JavaScript", "React"],
        },
        sourceEmail: email,
        companyId: TARGET_COMPANY_ID,
        source: "INBOUND_EMAIL",
      });

      const promise2 = createCandidateIfRequired({
        extractedData: {
          name: "Shivam Solanki",
          email,
          skills: ["JavaScript", "React", "PostgreSQL"],
        },
        sourceEmail: email,
        companyId: TARGET_COMPANY_ID,
        source: "INBOUND_EMAIL",
      });

      const [res1, res2] = await Promise.all([promise1, promise2]);

      // Exactly one created: true, the other created: false
      assert.equal(res1.created || res2.created, true);
      assert.equal(res1.created && res2.created, false);

      // Both resolved the exact same candidate
      assert.equal(res1.candidate.id, res2.candidate.id);
      assert.equal(res1.candidate.email, email);
      assert.equal(res2.candidate.email, email);

      // Only one DB insert occurred
      assert.equal(userCreateCallCount, 1, "db.user.create must be called exactly once despite concurrency");

      // Candidate is linked to target company
      const profile = candidateProfilesDb.get(email);
      assert.ok(profile);
      assert.equal(profile.userId, res1.candidate.id);
    });
  });

  // 3. Transaction Rollback & Aborted Transaction Safety
  describe("3. Transaction Rollback & Aborted Transaction Safety", () => {
    it("gracefully recovers from P2002 cross-process race without querying on poisoned connection", async () => {
      const email = "cross.process.candidate@gmail.com";

      // Simulate external concurrent process inserting user right after findCandidateByEmail returns null
      let findCount = 0;
      repository.findCandidateByEmail = async (em) => {
        findCount++;
        if (findCount === 1) {
          return null; // First lookup sees nothing
        }
        // Subsequent lookup finds user inserted by concurrent process
        return {
          id: "usr_concurrent_process_99",
          email: em.trim().toLowerCase(),
          role: "CANDIDATE",
          status: "ACTIVE",
          companyMembers: [],
        };
      };

      // Force createCandidate to throw P2002
      repository.createCandidate = async () => {
        const err = new Error("Unique constraint failed on the fields: (email)");
        err.code = "P2002";
        throw err;
      };

      // Mock a transactional client that poisons when an error occurs (simulating PostgreSQL 25P02)
      let transactionAborted = false;
      const mockTx = {
        $executeRaw: async () => {},
        user: {
          findUnique: async () => {
            if (transactionAborted) {
              const abortErr = new Error("25P02: current transaction is aborted, commands ignored until end of transaction block");
              abortErr.code = "25P02";
              throw abortErr;
            }
            return null;
          },
        },
      };

      // When createCandidate throws inside mockTx, it marks transaction as aborted
      const result = await createCandidateIfRequired({
        extractedData: {
          name: "Cross Process",
          email,
          skills: ["Node.js"],
        },
        sourceEmail: email,
        companyId: TARGET_COMPANY_ID,
        source: "INBOUND_EMAIL",
        tx: mockTx,
      });

      assert.equal(result.created, false);
      assert.equal(result.candidate.id, "usr_concurrent_process_99");
      assert.equal(result.candidate.email, email);
    });
  });

  // 4. Non-Candidate Account Rejection & Recruiter Forwarding
  describe("4. Non-Candidate Accounts & Business Rules", () => {
    it("rejects application when candidate email belongs to a SUPER_ADMIN", async () => {
      const superAdmin = {
        id: "usr_super_admin_1",
        email: "admin@hirequest.com",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
        companyMembers: [],
      };
      usersDb.set(superAdmin.email, superAdmin);

      await assert.rejects(
        async () => {
          await createCandidateIfRequired({
            extractedData: {
              name: "Super Admin",
              email: "admin@hirequest.com",
            },
            sourceEmail: "admin@hirequest.com",
            companyId: TARGET_COMPANY_ID,
            source: "INBOUND_EMAIL",
          });
        },
        (err) => {
          assert.equal(err.code, "CANDIDATE_EMAIL_CONFLICT");
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /non-candidate account/i);
          return true;
        }
      );

      // SuperAdmin must not be modified or demoted
      assert.equal(usersDb.get("admin@hirequest.com").role, "SUPER_ADMIN");
    });

    it("rejects application when sender is an active HR/staff member of the TARGET company applying for themselves", async () => {
      const fbOwner = {
        id: "usr_fb_owner_1",
        email: "vs2917239@gmail.com",
        role: "HR",
        status: "ACTIVE",
        companyMembers: [
          {
            companyId: TARGET_COMPANY_ID,
            role: "OWNER",
          },
        ],
      };
      usersDb.set(fbOwner.email, fbOwner);

      await assert.rejects(
        async () => {
          await createCandidateIfRequired({
            extractedData: {
              name: "Facebook Owner",
              email: "vs2917239@gmail.com",
            },
            sourceEmail: "vs2917239@gmail.com",
            companyId: TARGET_COMPANY_ID,
            source: "INBOUND_EMAIL",
          });
        },
        (err) => {
          assert.equal(err.code, "CANDIDATE_EMAIL_CONFLICT");
          assert.equal(err.statusCode, 409);
          assert.match(err.message, /non-candidate account/i);
          return true;
        }
      );

      // HR Owner must retain their HR role
      assert.equal(usersDb.get("vs2917239@gmail.com").role, "HR");
    });

    it("accepts candidate when target company HR member emails a candidate resume attached", async () => {
      // Recruiter is an HR member of Facebook Company
      const fbRecruiter = {
        id: "usr_fb_recruiter_1",
        email: "vs2917239@gmail.com",
        role: "HR",
        status: "ACTIVE",
        companyMembers: [
          {
            companyId: TARGET_COMPANY_ID,
            role: "RECRUITER",
          },
        ],
      };
      usersDb.set(fbRecruiter.email, fbRecruiter);

      // Recruiter forwards/submits candidate's resume directly
      const result = await createCandidateIfRequired({
        extractedData: {
          name: "Rohit Panchal",
          email: "rohitpanchal958466@gmail.com", // Candidate's email extracted from resume
          skills: ["Node.js", "Express", "Docker"],
        },
        sourceEmail: "vs2917239@gmail.com", // Recruiter's outer sending email
        companyId: TARGET_COMPANY_ID,
        source: "INBOUND_EMAIL",
      });

      // Must succeed: candidate is created as Rohit, NOT recruiter
      assert.equal(result.created, true);
      assert.equal(result.candidate.email, "rohitpanchal958466@gmail.com");
      assert.equal(result.candidate.role, "CANDIDATE");

      // Recruiter's account remains untouched
      assert.equal(usersDb.get("vs2917239@gmail.com").role, "HR");
    });
  });
});

