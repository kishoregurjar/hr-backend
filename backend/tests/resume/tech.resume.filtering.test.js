"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const resumeService = require("../../src/modules/resume/resume.service");
const repository = require("../../src/modules/resume/resume.repository");
const parserService = require("../../src/modules/resume/resume.parser.service");
const mailboxService = require("../../src/modules/mailbox/mailbox.service");
const mailboxRepository = require("../../src/modules/mailbox/mailbox.repository");
const driveService = require("../../src/modules/mailbox/drive.service");
const { prisma } = require("../../src/config/prisma");

describe("Phase 3: Tech Resume Filtering, Lightweight Pre-Check & Attachment Isolation Suite", () => {
  let origFindResumeByHash;
  let origFindResumeProcessingById;
  let origCreateResumeProcessing;
  let origCreateResumeProcessingSafely;
  let origUpdateResumeProcessing;
  let origParseResume;
  let origFindCandidate;
  let origCreateCandidate;
  let origEnsureProfile;
  let origPrismaTransaction;
  let origFindFirstMember;
  let origUpdateManyProfile;

  const store = {
    resumes: new Map(),
    users: new Map(),
    profiles: new Map(),
  };

  const dummyPdfHeader = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";

  beforeEach(() => {
    origFindResumeByHash = repository.findResumeByHash;
    origFindResumeProcessingById = repository.findResumeProcessingById;
    origCreateResumeProcessing = repository.createResumeProcessing;
    origCreateResumeProcessingSafely = repository.createResumeProcessingSafely;
    origUpdateResumeProcessing = repository.updateResumeProcessing;
    origParseResume = parserService.parseResume;
    origFindCandidate = repository.findCandidateByEmail;
    origCreateCandidate = repository.createCandidate;
    origEnsureProfile = repository.ensureCandidateProfile;
    origPrismaTransaction = prisma.$transaction;
    origFindFirstMember = prisma.companyMember?.findFirst;
    origUpdateManyProfile = prisma.candidateProfile?.updateMany;

    prisma.$transaction = async (fn) => fn(prisma);
    if (prisma.companyMember) {
      prisma.companyMember.findFirst = async () => ({ companyId: "comp_tech_001" });
    }
    if (prisma.candidateProfile) {
      prisma.candidateProfile.updateMany = async () => ({ count: 1 });
    }

    store.resumes.clear();
    store.users.clear();
    store.profiles.clear();

    repository.findResumeByHash = async (hash) => store.resumes.get(hash) || null;
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
    repository.findCandidateByEmail = async (email) => store.users.get(email) || null;
    repository.createCandidate = async (data) => {
      const user = { id: "usr_" + Math.random().toString(36).slice(2, 8), ...data, role: "CANDIDATE" };
      store.users.set(data.email, user);
      return user;
    };
    repository.ensureCandidateProfile = async (user, data, companyId) => {
      const prof = { id: "prof_" + Math.random().toString(36).slice(2, 8), userId: user.id, companyId, ...data };
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
    parserService.parseResume = origParseResume;
    repository.findCandidateByEmail = origFindCandidate;
    repository.createCandidate = origCreateCandidate;
    repository.ensureCandidateProfile = origEnsureProfile;
    prisma.$transaction = origPrismaTransaction;
    if (prisma.companyMember) prisma.companyMember.findFirst = origFindFirstMember;
    if (prisma.candidateProfile) prisma.candidateProfile.updateMany = origUpdateManyProfile;
  });

  it("1. Valid React/Node.js Tech resume is ingested and creates candidate", async () => {
    const pdfBuf = Buffer.from(dummyPdfHeader + "content_1");
    parserService.parseResume = async () => ({
      status: "PARSED",
      text: "Alex Chen\nEmail: alex@example.com\nPhone: +1 555-019-2834\nEducation: BS in Computer Science\nProfessional Experience:\nSenior Full Stack Developer with JavaScript, React, Node.js, PostgreSQL, Docker.",
      extractedData: {
        name: "Alex Chen",
        email: "alex@example.com",
        phone: "+15550192834",
        skills: ["JavaScript", "React.js", "Node.js", "PostgreSQL", "Docker"],
      },
    });

    const result = await resumeService.processResume({
      file: { buffer: pdfBuf, originalname: "Alex_Chen_Resume.pdf", mimetype: "application/pdf", size: pdfBuf.length },
      source: "INBOUND_EMAIL",
      sourceEmail: "alex@example.com",
      companyId: "comp_tech_001",
    });

    assert.equal(result.duplicate, false);
    assert.ok(result.candidateId);
    assert.ok(result.resumeProcessing.status === "COMPLETED" || result.resumeProcessing.status === "REVIEW_REQUIRED");
    assert.ok(store.users.has("alex@example.com"));
  });

  it("2. Valid Tech resume with fewer than 2 dictionary skills but clear Tech role is NOT rejected", async () => {
    const pdfBuf = Buffer.from(dummyPdfHeader + "content_2");
    // Only 1 skill from dictionary (Kotlin), but clear tech role & computer science degree
    parserService.parseResume = async () => ({
      status: "PARSED",
      text: "Devin Vance\nEmail: devin@example.com\nPhone: +1 555-019-8765\nEducation: Bachelor of Technology in Information Technology\nWork Experience:\nAndroid Developer at MobileTech\nBuilt native mobile applications with Kotlin, Coroutines, Jetpack Compose, and Dagger Hilt.",
      extractedData: {
        name: "Devin Vance",
        email: "devin@example.com",
        phone: "+15550198765",
        skills: ["Kotlin"],
      },
    });

    const result = await resumeService.processResume({
      file: { buffer: pdfBuf, originalname: "Devin_Android.pdf", mimetype: "application/pdf", size: pdfBuf.length },
      source: "INBOUND_EMAIL",
      sourceEmail: "devin@example.com",
      companyId: "comp_tech_001",
    });

    assert.equal(result.duplicate, false);
    assert.ok(result.candidateId);
    assert.ok(result.resumeProcessing.status === "COMPLETED" || result.resumeProcessing.status === "REVIEW_REQUIRED");
    assert.ok(store.users.has("devin@example.com"));
  });

  it("3. Genuine Tech resume containing 'Job Title', 'CTC', and 'Internship Duration' is NOT falsely classified as a JD", async () => {
    const pdfBuf = Buffer.from(dummyPdfHeader + "content_3");
    parserService.parseResume = async () => ({
      status: "PARSED",
      text: "Pooja Sharma\nEmail: pooja@example.com\nPhone: +91 9876543210\nEducation: B.Tech in Computer Engineering (2020-2024)\nProfessional Experience:\nJob Title: Backend Developer\nCurrent CTC: 8 LPA, Expected CTC: 14 LPA\nInternship Duration: 6 months (Stipend: 25k/month)\nSkills: Java, Spring Boot, MySQL, REST APIs.",
      extractedData: {
        name: "Pooja Sharma",
        email: "pooja@example.com",
        phone: "+919876543210",
        skills: ["Java", "Spring Boot", "MySQL", "REST APIs"],
      },
    });

    const result = await resumeService.processResume({
      file: { buffer: pdfBuf, originalname: "Pooja_Resume.pdf", mimetype: "application/pdf", size: pdfBuf.length },
      source: "INBOUND_EMAIL",
      sourceEmail: "pooja@example.com",
      companyId: "comp_tech_001",
    });

    assert.equal(result.duplicate, false);
    assert.ok(result.candidateId);
    assert.ok(result.resumeProcessing.status === "COMPLETED" || result.resumeProcessing.status === "REVIEW_REQUIRED");
    assert.ok(store.users.has("pooja@example.com"));
  });

  it("4. A clearly non-Tech resume (e.g. Registered Nurse, Sales) does NOT create a candidate", async () => {
    const pdfBuf = Buffer.from(dummyPdfHeader + "content_4");
    parserService.parseResume = async () => ({
      status: "PARSED",
      text: "Sarah Jenkins\nEmail: sarah@example.com\nPhone: +1 555-234-5678\nEducation: Bachelor of Science in Nursing\nWork Experience:\nRegistered Nurse at St. Jude Hospital\nPatient triage, medication administration, emergency care, clinical documentation.",
      extractedData: {
        name: "Sarah Jenkins",
        email: "sarah@example.com",
        phone: "+15552345678",
        skills: [],
      },
    });

    await assert.rejects(
      async () => {
        await resumeService.processResume({
          file: { buffer: pdfBuf, originalname: "Sarah_Nurse.pdf", mimetype: "application/pdf", size: pdfBuf.length },
          source: "INBOUND_EMAIL",
          sourceEmail: "sarah@example.com",
          companyId: "comp_tech_001",
        });
      },
      (err) => {
        assert.equal(err.code, "NOT_A_TECH_RESUME");
        return true;
      }
    );

    assert.equal(store.users.has("sarah@example.com"), false, "Non-tech candidate must not be created");
  });

  it("5. A real Job Description PDF does NOT create a candidate", async () => {
    const pdfBuf = Buffer.from(dummyPdfHeader + "content_5");
    parserService.parseResume = async () => ({
      status: "PARSED",
      text: "WE ARE HIRING: Senior Frontend Architect\nJob Description:\nAbout the role: You will lead UI architecture across microfrontends.\nKey Responsibilities:\n- Design scalable React applications\n- Establish engineering standards\nWhat we offer: Competitive salary, health insurance, 401(k).\nEqual opportunity employer. How to apply: Submit application to careers@techcorp.com.",
      extractedData: {
        name: null,
        email: "careers@techcorp.com",
        phone: null,
        skills: ["React"],
      },
    });

    await assert.rejects(
      async () => {
        await resumeService.processResume({
          file: { buffer: pdfBuf, originalname: "Frontend_Job_Description.pdf", mimetype: "application/pdf", size: pdfBuf.length },
          source: "INBOUND_EMAIL",
          sourceEmail: "recruiter@techcorp.com",
          companyId: "comp_tech_001",
        });
      },
      (err) => {
        assert.equal(err.code, "NOT_A_RESUME");
        return true;
      }
    );

    assert.equal(store.users.has("careers@techcorp.com"), false, "JD must not create candidate");
  });

  it("6. An ambiguous supported document follows safe verification (REVIEW_REQUIRED)", async () => {
    const pdfBuf = Buffer.from(dummyPdfHeader + "content_6");
    // Has candidate personal contact and length, but no clear tech signals
    parserService.parseResume = async () => ({
      status: "PARSED",
      text: "Taylor Green\nEmail: taylor@example.com\nPhone: +1 555-876-5432\nEducation: Bachelor of General Studies\nProfessional Experience:\nOperations Coordinator at Apex Logistics.\nMaintained spreadsheets, communicated with suppliers, coordinated project schedules.",
      extractedData: {
        name: "Taylor Green",
        email: "taylor@example.com",
        phone: "+15558765432",
        skills: [],
      },
    });

    const result = await resumeService.processResume({
      file: { buffer: pdfBuf, originalname: "Taylor_Green.pdf", mimetype: "application/pdf", size: pdfBuf.length },
      source: "INBOUND_EMAIL",
      sourceEmail: "taylor@example.com",
      companyId: "comp_tech_001",
    });

    // Follows safe review path: does NOT throw fatal error, does NOT create active candidate
    assert.equal(result.resumeProcessing.status, "REVIEW_REQUIRED");
    assert.equal(result.candidateId, null);
    assert.equal(store.users.has("taylor@example.com"), false);
  });

  it("7. Corrupt/empty/scanned PDFs produce safe, visible internal outcomes", async () => {
    const emptyBuf = Buffer.alloc(0);

    await assert.rejects(
      async () => {
        await resumeService.processResume({
          file: { buffer: emptyBuf, originalname: "empty.pdf", mimetype: "application/pdf", size: 0 },
          source: "INBOUND_EMAIL",
          sourceEmail: "empty@example.com",
          companyId: "comp_tech_001",
        });
      },
      (err) => {
        assert.ok(err.message.includes("empty") || err.code.includes("EMPTY"));
        return true;
      }
    );
  });

  it("8. Duplicate processing returns duplicate: true without re-creating candidate", async () => {
    const pdfBuf = Buffer.from(dummyPdfHeader + "content_8");
    parserService.parseResume = async () => ({
      status: "PARSED",
      text: "Kiran Rao\nEmail: kiran@example.com\nPhone: +1 555-345-6789\nSoftware Engineer with Python, Django, PostgreSQL.",
      extractedData: {
        name: "Kiran Rao",
        email: "kiran@example.com",
        phone: "+15553456789",
        skills: ["Python", "Django", "PostgreSQL"],
      },
    });

    const first = await resumeService.processResume({
      file: { buffer: pdfBuf, originalname: "kiran.pdf", mimetype: "application/pdf", size: pdfBuf.length },
      source: "INBOUND_EMAIL",
      sourceEmail: "kiran@example.com",
      providerMessageId: "msg_dup_1",
      companyId: "comp_tech_001",
    });

    assert.equal(first.duplicate, false);

    const second = await resumeService.processResume({
      file: { buffer: pdfBuf, originalname: "kiran.pdf", mimetype: "application/pdf", size: pdfBuf.length },
      source: "INBOUND_EMAIL",
      sourceEmail: "kiran@example.com",
      providerMessageId: "msg_dup_1",
      companyId: "comp_tech_001",
    });

    assert.equal(second.duplicate, true);
    assert.equal(second.candidateId, first.candidateId);
  });
});
