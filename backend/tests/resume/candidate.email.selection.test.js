"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  detectForwardedEmail,
  normalizeEmail,
} = require("../../src/modules/resume/email.extractor.service");
const {
  createCandidateIfRequired,
} = require("../../src/modules/resume/resume.service");
const repository = require("../../src/modules/resume/resume.repository");
const { prisma } = require("../../src/config/prisma");

describe("Candidate Email Selection & Forward Safety Suite", () => {
  describe("detectForwardedEmail Helper", () => {
    it("identifies direct candidate submission without forward markers", () => {
      const result = detectForwardedEmail({
        subject: "Job Application - Software Engineer",
        text: "Please find attached my resume.\nThanks,\nRahul",
        sender: "rahul.sharma@gmail.com",
        replyTo: "rahul.sharma@gmail.com",
      });

      assert.equal(result.isForwarded, false);
      assert.equal(result.candidateEmail, null);
    });

    it("identifies forwarded message via Subject Fwd: prefix", () => {
      const result = detectForwardedEmail({
        subject: "Fwd: Resume of Rahul Sharma",
        text: "Here is the candidate profile for review.",
        sender: "recruiter@agency.com",
        replyTo: "",
      });

      assert.equal(result.isForwarded, true);
      assert.equal(result.candidateEmail, null); // recruiter email discarded
    });

    it("identifies forwarded message via Subject FW: prefix", () => {
      const result = detectForwardedEmail({
        subject: "FW: Senior Developer Profile",
        text: "Please review.",
        sender: "talent@external.com",
      });

      assert.equal(result.isForwarded, true);
      assert.equal(result.candidateEmail, null);
    });

    it("extracts candidate email from Gmail forwarded body header", () => {
      const text = [
        "FYI, see candidate details below.",
        "---------- Forwarded message ---------",
        "From: Rahul Sharma <rahul.sharma@gmail.com>",
        "Date: Tue, Oct 27, 2026 at 2:00 PM",
        "Subject: Applying for Tech Lead",
        "To: jobs@company.com",
        "",
        "Hi, I would like to apply.",
      ].join("\n");

      const result = detectForwardedEmail({
        subject: "Fwd: Applying for Tech Lead",
        text,
        sender: "recruiter@agency.com",
      });

      assert.equal(result.isForwarded, true);
      assert.equal(result.candidateEmail, "rahul.sharma@gmail.com");
    });

    it("extracts candidate email from Outlook forwarded body header", () => {
      const text = [
        "Sharing applicant resume.",
        "-----Original Message-----",
        "From: anita.dev@gmail.com",
        "Sent: Monday, October 26, 2026 10:30 AM",
        "To: careers@company.com",
        "Subject: Software Engineer Application",
      ].join("\n");

      const result = detectForwardedEmail({
        subject: "FW: Software Engineer Application",
        text,
        sender: "headhunter@staffing.com",
      });

      assert.equal(result.isForwarded, true);
      assert.equal(result.candidateEmail, "anita.dev@gmail.com");
    });

    it("rejects uncorroborated Reply-To when message is forwarded without body candidate", () => {
      const result = detectForwardedEmail({
        subject: "Fwd: Potential candidate",
        text: "Review this resume please.",
        sender: "recruiter@agency.com",
        replyTo: "agency-desk@agency.com", // uncorroborated recruiter desk email
        resumeEmail: "candidate.in.resume@gmail.com",
      });

      assert.equal(result.isForwarded, true);
      // Reply-to differs from resumeEmail and sender has no body header -> NOT trusted
      assert.equal(result.candidateEmail, null);
    });

    it("accepts Reply-To when corroborated by matching resume email", () => {
      const result = detectForwardedEmail({
        subject: "Fwd: Resume attached",
        text: "Candidate forwarded profile.",
        sender: "recruiter@agency.com",
        replyTo: "candidate.in.resume@gmail.com", // matches resume email
        resumeEmail: "candidate.in.resume@gmail.com",
      });

      assert.equal(result.isForwarded, true);
      assert.equal(result.candidateEmail, "candidate.in.resume@gmail.com");
    });
  });

  describe("Resume Precedence & Extraction Logic", () => {
    let origFindCandidate;
    let origCreateCandidate;
    let origEnsureProfile;

    let createdUser = null;
    let ensuredProfile = null;
    let capturedSafeExtractedData = null;

    beforeEach(() => {
      origFindCandidate = repository.findCandidateByEmail;
      origCreateCandidate = repository.createCandidate;
      origEnsureProfile = repository.ensureCandidateProfile;

      createdUser = null;
      ensuredProfile = null;
      capturedSafeExtractedData = null;

      repository.findCandidateByEmail = async () => null; // default: new candidate
      repository.createCandidate = async (data) => {
        createdUser = { id: "usr_mock", ...data };
        return createdUser;
      };
      repository.ensureCandidateProfile = async (user, safeExtractedData) => {
        capturedSafeExtractedData = safeExtractedData;
        ensuredProfile = {
          id: "prof_mock",
          userId: user.id,
          email: user.email,
          metadata: safeExtractedData,
        };
        return ensuredProfile;
      };
    });

    afterEach(() => {
      repository.findCandidateByEmail = origFindCandidate;
      repository.createCandidate = origCreateCandidate;
      repository.ensureCandidateProfile = origEnsureProfile;
    });

    it("direct submission: prioritizes verified source email over resume email and preserves resume email in metadata", async () => {
      // Direct candidate submission:
      // sender: rahul.sharma@gmail.com, resume contains: rahul.old@gmail.com
      const res = await createCandidateIfRequired({
        extractedData: {
          name: "Rahul Sharma",
          email: "rahul.old@gmail.com",
          skills: ["Node.js", "React"],
        },
        sourceEmail: "rahul.sharma@gmail.com",
        isForwarded: false,
        source: "INBOUND_EMAIL",
      });

      assert.equal(res.candidate.email, "rahul.sharma@gmail.com");
      assert.equal(res.created, true);
      assert.equal(capturedSafeExtractedData.resumeExtractedEmail, "rahul.old@gmail.com");
    });

    it("forwarded resume without body header: falls back to resume email and discards recruiter email", async () => {
      // Forwarded: sourceEmail is null because forwardInfo could not extract candidate
      // extractedData has candidate's actual resume email
      const res = await createCandidateIfRequired({
        extractedData: {
          name: "Anita Verma",
          email: "anita.verma@gmail.com",
          skills: ["Python", "PostgreSQL"],
        },
        sourceEmail: null, // recruiter email was discarded!
        fallbackEmail: null,
        isForwarded: true,
        source: "INBOUND_EMAIL",
      });

      assert.equal(res.candidate.email, "anita.verma@gmail.com");
      assert.equal(res.created, true);
    });

    it("forwarded resume with candidate in body: uses candidate email extracted from forward block", async () => {
      const res = await createCandidateIfRequired({
        extractedData: {
          name: "John Doe",
          email: "john.old@gmail.com",
          skills: ["Go", "Kubernetes"],
        },
        sourceEmail: "john.current@gmail.com", // extracted from body header
        isForwarded: true,
        source: "INBOUND_EMAIL",
      });

      assert.equal(res.candidate.email, "john.current@gmail.com");
      assert.equal(capturedSafeExtractedData.resumeExtractedEmail, "john.old@gmail.com");
    });

    it("direct upload (DIRECT_UPLOAD): uses resume email", async () => {
      const res = await createCandidateIfRequired({
        extractedData: {
          name: "Manual Candidate",
          email: "manual.upload@example.com",
          skills: ["Java"],
        },
        sourceEmail: null,
        isForwarded: false,
        source: "DIRECT_UPLOAD",
      });

      assert.equal(res.candidate.email, "manual.upload@example.com");
      assert.equal(res.created, true);
    });

    it("missing resume email: falls back to verified source email", async () => {
      const res = await createCandidateIfRequired({
        extractedData: {
          name: "No Email Resume",
          email: null,
          skills: ["TypeScript"],
        },
        sourceEmail: "applicant.direct@gmail.com",
        isForwarded: false,
        source: "INBOUND_EMAIL",
      });

      assert.equal(res.candidate.email, "applicant.direct@gmail.com");
      assert.equal(res.created, true);
    });

    it("missing both resume email and source email: throws CANDIDATE_EMAIL_NOT_FOUND", async () => {
      await assert.rejects(
        async () => {
          await createCandidateIfRequired({
            extractedData: {
              name: "No Email Anywhere",
              email: null,
            },
            sourceEmail: null,
            isForwarded: false,
            source: "INBOUND_EMAIL",
          });
        },
        (err) => err.code === "CANDIDATE_EMAIL_NOT_FOUND" && err.statusCode === 422
      );
    });
  });

  describe("Edge Case: Resume email matches existing profile but verified source email differs", () => {
    it("preserves existing profile untouched and creates separate profile for active contact email", async () => {
      // Existing historical profile in database for old email
      const historicalProfile = {
        id: "prof_old",
        email: "rahul.old@gmail.com",
        role: "CANDIDATE",
        metadata: { pastAssessmentScore: 88 },
      };

      let queriedEmail = null;
      let newCandidateCreated = null;

      // Mock repository methods
      const origFindCandidate = repository.findCandidateByEmail;
      const origCreateCandidate = repository.createCandidate;
      const origEnsureProfile = repository.ensureCandidateProfile;

      try {
        repository.findCandidateByEmail = async (email) => {
          queriedEmail = email;
          if (email === "rahul.old@gmail.com") return historicalProfile;
          return null; // rahul.sharma@gmail.com does not exist yet
        };

        repository.createCandidate = async (data) => {
          newCandidateCreated = { id: "usr_new", role: "CANDIDATE", ...data };
          return newCandidateCreated;
        };

        repository.ensureCandidateProfile = async (user, safeExtractedData) => {
          return {
            id: "prof_new",
            userId: user.id,
            email: user.email,
            metadata: safeExtractedData,
          };
        };

        // Incoming application with new sender email and old resume email
        const result = await createCandidateIfRequired({
          extractedData: {
            name: "Rahul Sharma",
            email: "rahul.old@gmail.com",
            skills: ["Node.js", "Docker"],
          },
          sourceEmail: "rahul.sharma@gmail.com",
          isForwarded: false,
          source: "INBOUND_EMAIL",
        });

        // 1. Queried email must be the authoritative source email, NOT the old resume email
        assert.equal(queriedEmail, "rahul.sharma@gmail.com");

        // 2. New profile must be created under the active contact email
        assert.equal(result.candidate.email, "rahul.sharma@gmail.com");
        assert.equal(result.created, true);

        // 3. Historical profile for rahul.old@gmail.com was NEVER modified, overwritten, or merged
        assert.equal(historicalProfile.email, "rahul.old@gmail.com");
        assert.equal(historicalProfile.metadata.pastAssessmentScore, 88);
      } finally {
        repository.findCandidateByEmail = origFindCandidate;
        repository.createCandidate = origCreateCandidate;
        repository.ensureCandidateProfile = origEnsureProfile;
      }
    });
  });

  describe("Metadata Non-Destructive Merging", () => {
    it("preserves unrelated existing metadata fields and adds resumeExtractedEmail", async () => {
      const existingCandidate = {
        id: "prof_existing",
        firstName: "Rahul",
        lastName: "Sharma",
        companyId: "comp_1",
        metadata: {
          recruiterNotes: "Strong background in backend architecture",
          customTags: ["tier-1-candidate"],
          skills: ["Node.js"],
        },
      };

      // Mock prisma.candidateProfile.findUnique and upsert
      const origFindUnique = prisma.candidateProfile.findUnique;
      const origUpsert = prisma.candidateProfile.upsert;
      const origCompanyUpsert = prisma.companyCandidate.upsert;

      let savedMetadata = null;

      try {
        prisma.candidateProfile.findUnique = async () => existingCandidate;
        prisma.candidateProfile.upsert = async ({ update }) => {
          savedMetadata = update.metadata;
          return { id: "prof_existing", ...update };
        };
        prisma.companyCandidate.upsert = async () => ({});

        const safeExtractedData = {
          name: "Rahul Sharma",
          email: "rahul.sharma@gmail.com", // cleaned by ensureCandidateProfile
          resumeExtractedEmail: "rahul.old@gmail.com",
          skills: ["React", "PostgreSQL"],
        };

        await repository.ensureCandidateProfile(
          { id: "usr_1", email: "rahul.sharma@gmail.com" },
          safeExtractedData,
          "comp_1",
          prisma
        );

        // Assert existing metadata fields are preserved
        assert.equal(savedMetadata.recruiterNotes, "Strong background in backend architecture");
        assert.deepEqual(savedMetadata.customTags, ["tier-1-candidate"]);

        // Assert skills are merged
        assert.ok(savedMetadata.skills.includes("Node.js"));
        assert.ok(savedMetadata.skills.includes("React"));
        assert.ok(savedMetadata.skills.includes("PostgreSQL"));

        // Assert resumeExtractedEmail is cleanly stored
        assert.equal(savedMetadata.resumeExtractedEmail, "rahul.old@gmail.com");

        // Assert .email is cleaned from metadata
        assert.equal(savedMetadata.email, undefined);
      } finally {
        prisma.candidateProfile.findUnique = origFindUnique;
        prisma.candidateProfile.upsert = origUpsert;
        prisma.companyCandidate.upsert = origCompanyUpsert;
      }
    });
  });
});
