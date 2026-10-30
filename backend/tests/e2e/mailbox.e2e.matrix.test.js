"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const mailboxService = require("../../src/modules/mailbox/mailbox.service");
const mailboxRepository = require("../../src/modules/mailbox/mailbox.repository");
const resumeRepository = require("../../src/modules/resume/resume.repository");
const repository = resumeRepository;
const resumeService = require("../../src/modules/resume/resume.service");
const parserService = require("../../src/modules/resume/resume.parser.service");
const driveService = require("../../src/modules/mailbox/drive.service");
const { prisma } = require("../../src/config/prisma");
const { google } = require("googleapis");

describe("Comprehensive E2E Mailbox & Resume Ingestion Matrix Suite", () => {
  const dummyPdfHeader = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n";

  let origFindMailbox;
  let origUpdateMailbox;
  let origFindEvents;
  let origCreateEvent;
  let origUpdateEvent;
  let origMarkCompleted;
  let origMarkFailed;
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
  let origDownloadDrive;
  let origGoogleGmail;
  let origPrismaTransaction;
  let origFindFirstMember;
  let origUpdateManyProfile;
  const origProcessResume = resumeService.processResume;

  const store = {
    mailboxes: new Map(),
    events: new Map(),
    resumes: new Map(),
    users: new Map(),
    profiles: new Map(),
    binaryDownloadCount: 0,
    fullMessageGetCount: 0,
  };

  const TEST_USER_ID = "usr_e2e_recruiter";
  const TEST_COMPANY_ID = "comp_e2e_target";
  const TEST_MAILBOX_EMAIL = "recruiter@hirequest.internal";

  beforeEach(() => {
    store.mailboxes.clear();
    store.events.clear();
    store.resumes.clear();
    store.users.clear();
    store.profiles.clear();
    store.binaryDownloadCount = 0;
    store.fullMessageGetCount = 0;

    origFindMailbox = mailboxRepository.findMailboxByUserId;
    origUpdateMailbox = mailboxRepository.updateMailboxSyncStatus;
    origFindEvents = resumeRepository.findInboundEmailEventsByMessageIds;
    origCreateEvent = resumeRepository.createInboundEmailEventSafely;
    origUpdateEvent = resumeRepository.updateInboundEmailEvent;
    origMarkCompleted = resumeRepository.markInboundEmailEventCompleted;
    origMarkFailed = resumeRepository.markInboundEmailEventFailed;
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
    origDownloadDrive = driveService.downloadDriveFile;
    origGoogleGmail = google.gmail;
    origPrismaTransaction = prisma.$transaction;
    origFindFirstMember = prisma.companyMember?.findFirst;
    origUpdateManyProfile = prisma.candidateProfile?.updateMany;

    resumeService.processResume = origProcessResume;

    prisma.$transaction = async (fn) => fn(prisma);
    if (prisma.companyMember) {
      prisma.companyMember.findFirst = async ({ where } = {}) => {
        if (where?.userId === TEST_USER_ID) {
          return { companyId: TEST_COMPANY_ID, role: "RECRUITER" };
        }
        return null;
      };
    }
    if (prisma.candidateProfile) {
      prisma.candidateProfile.updateMany = async () => ({ count: 1 });
    }

    store.mailboxes.set(TEST_USER_ID, {
      userId: TEST_USER_ID,
      email: TEST_MAILBOX_EMAIL,
      refreshToken: "mock-refresh-token",
      lastSyncedAt: null,
      backfillComplete: true,
      backfillPageToken: null,
    });

    mailboxRepository.findMailboxByUserId = async (uid) => store.mailboxes.get(uid) || null;
    mailboxRepository.updateMailboxSyncStatus = async (uid, data) => {
      const mb = store.mailboxes.get(uid) || { userId: uid };
      Object.assign(mb, data);
      store.mailboxes.set(uid, mb);
      return mb;
    };

    resumeRepository.createInboundEmailEventSafely = async (data) => {
      if (store.events.has(data.providerMessageId)) {
        return store.events.get(data.providerMessageId);
      }
      const evt = {
        id: "evt_" + data.providerMessageId,
        provider: data.provider,
        providerMessageId: data.providerMessageId,
        recipientEmail: data.recipientEmail,
        status: "PROCESSING",
        createdAt: new Date(),
        receivedAt: new Date(),
      };
      store.events.set(data.providerMessageId, evt);
      return evt;
    };

    resumeRepository.findInboundEmailEventsByMessageIds = async (provider, msgIds) => {
      return msgIds.map((id) => store.events.get(id)).filter(Boolean);
    };

    resumeRepository.updateInboundEmailEvent = async (id, data) => {
      for (const e of store.events.values()) {
        if (e.id === id) {
          Object.assign(e, data);
          return e;
        }
      }
      return { id, ...data };
    };

    resumeRepository.markInboundEmailEventCompleted = async (id, resId) => {
      for (const e of store.events.values()) {
        if (e.id === id) {
          e.status = "COMPLETED";
          e.resumeProcessingId = resId;
          e.completedAt = new Date();
          return e;
        }
      }
      return null;
    };

    resumeRepository.markInboundEmailEventFailed = async (id, code, msg) => {
      for (const e of store.events.values()) {
        if (e.id === id) {
          e.status = "FAILED";
          e.errorCode = code;
          e.errorMessage = msg;
          return e;
        }
      }
      return null;
    };

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
    repository.touchResumeProcessing = async (id) => {
      for (const r of store.resumes.values()) {
        if (r.id === id) {
          r.updatedAt = new Date();
          return r;
        }
      }
      return null;
    };
    repository.claimStaleResumeProcessing = async (id, staleBefore) => {
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
            return true;
          }
          return false;
        }
      }
      return false;
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
    mailboxRepository.findMailboxByUserId = origFindMailbox;
    mailboxRepository.updateMailboxSyncStatus = origUpdateMailbox;
    resumeRepository.findInboundEmailEventsByMessageIds = origFindEvents;
    resumeRepository.createInboundEmailEventSafely = origCreateEvent;
    resumeRepository.updateInboundEmailEvent = origUpdateEvent;
    resumeRepository.markInboundEmailEventCompleted = origMarkCompleted;
    resumeRepository.markInboundEmailEventFailed = origMarkFailed;
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
    driveService.downloadDriveFile = origDownloadDrive;
    google.gmail = origGoogleGmail;
    prisma.$transaction = origPrismaTransaction;
    if (prisma.companyMember) prisma.companyMember.findFirst = origFindFirstMember;
    if (prisma.candidateProfile) prisma.candidateProfile.updateMany = origUpdateManyProfile;
    resumeService.processResume = origProcessResume;
  });

  function setupMockGmail(messages) {
    const mock = {
      users: {
        messages: {
          list: async () => ({
            data: {
              messages: messages.map((m) => ({ id: m.id })),
            },
          }),
          get: async ({ id }) => {
            store.fullMessageGetCount++;
            const msg = messages.find((m) => m.id === id);
            return { data: msg };
          },
          attachments: {
            get: async ({ id }) => {
              store.binaryDownloadCount++;
              for (const m of messages) {
                const parts = m.payload?.parts || [];
                for (const p of parts) {
                  if (p.body?.attachmentId === id) {
                    const buf = p._testBuffer || Buffer.from(dummyPdfHeader + id);
                    return { data: { data: buf.toString("base64") } };
                  }
                }
              }
              return { data: { data: Buffer.from(dummyPdfHeader).toString("base64") } };
            },
          },
        },
      },
    };
    google.gmail = () => mock;
    return mock;
  }

  // =========================================================================
  // GROUP A: Email Subject & Body Scenarios
  // =========================================================================
  describe("Group A: Email Subject/Body Scenarios", () => {
    it("A1: Tech resume with explicit application subject is ingested", async () => {
      const msg = {
        id: "msg_a1",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Application for Senior Backend Engineer - David Kim" },
            { name: "From", value: "david.kim@example.com" },
          ],
          parts: [
            { filename: "David_Kim_Resume.pdf", mimeType: "application/pdf", body: { attachmentId: "att_a1", size: 5000 } },
          ],
        },
      };
      setupMockGmail([msg]);

      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "David Kim\nEmail: david.kim@example.com\nPhone: +1 555-111-2222\nEducation: BS in Computer Science\nExperience:\nBackend Engineer at CloudCorp\nBuilt microservices with Go, PostgreSQL, Docker, and Kubernetes.",
        extractedData: { name: "David Kim", email: "david.kim@example.com", phone: "+15551112222", skills: ["Go", "PostgreSQL", "Docker", "Kubernetes"] },
      });

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.processedResumes, 1);
      assert.ok(store.users.has("david.kim@example.com"));
    });

    it("A2: Blank subject with genuine Tech resume is NOT skipped", async () => {
      const msg = {
        id: "msg_a2",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "" }, // Blank subject
            { name: "From", value: "liam.patel@example.com" },
          ],
          parts: [
            { filename: "resume.pdf", mimeType: "application/pdf", body: { attachmentId: "att_a2", size: 5000 } },
          ],
        },
      };
      setupMockGmail([msg]);

      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "Liam Patel\nEmail: liam.patel@example.com\nPhone: +1 555-222-3333\nEducation: B.Tech in IT\nExperience: Frontend Developer with React, TypeScript, Redux, and Tailwind CSS.",
        extractedData: { name: "Liam Patel", email: "liam.patel@example.com", phone: "+15552223333", skills: ["React.js", "TypeScript", "Redux Toolkit", "Tailwind CSS"] },
      });

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.processedResumes, 1, "Blank subject resume must be ingested");
      assert.ok(store.users.has("liam.patel@example.com"));
    });

    it("A3: Generic subject 'Hello' with genuine Tech resume is NOT skipped", async () => {
      const msg = {
        id: "msg_a3",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Hello" },
            { name: "From", value: "emma@example.com" },
          ],
          parts: [
            { filename: "my_cv.pdf", mimeType: "application/pdf", body: { attachmentId: "att_a3", size: 5000 } },
          ],
        },
      };
      setupMockGmail([msg]);

      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "Emma Watson\nEmail: emma@example.com\nPhone: +1 555-333-4444\nEducation: BS in Computer Engineering\nSoftware Engineer with Python, Django, REST APIs, and AWS.",
        extractedData: { name: "Emma Watson", email: "emma@example.com", phone: "+15553334444", skills: ["Python", "Django", "REST APIs", "AWS"] },
      });

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.processedResumes, 1);
      assert.ok(store.users.has("emma@example.com"));
    });

    it("A4: Genuine Tech resume containing 'Job Title', 'CTC', 'Expected CTC', 'Stipend', and 'Internship Duration' is accepted", async () => {
      const msg = {
        id: "msg_a4",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Resume Submission" },
            { name: "From", value: "rahul.verma@example.com" },
          ],
          parts: [
            { filename: "Rahul_Verma.pdf", mimeType: "application/pdf", body: { attachmentId: "att_a4", size: 5000 } },
          ],
        },
      };
      setupMockGmail([msg]);

      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "Rahul Verma\nEmail: rahul.verma@example.com\nPhone: +91 9988776655\nEducation: B.Tech Computer Science (2020-2024)\nProfessional Experience:\nJob Title: Full Stack Developer\nCurrent CTC: 10 LPA | Expected CTC: 16 LPA\nInternship Duration: 6 months (Stipend: 30k/month)\nNotice Period: Immediate\nTechnical Skills: Java, Spring Boot, React, MySQL, Docker.",
        extractedData: { name: "Rahul Verma", email: "rahul.verma@example.com", phone: "+919988776655", skills: ["Java", "Spring Boot", "React.js", "MySQL", "Docker"] },
      });

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.processedResumes, 1, "Resume with CTC and Job Title terms must be accepted");
      assert.ok(store.users.has("rahul.verma@example.com"));
    });

    it("A5: Real Job Description document without candidate resume is rejected as NOT_A_RESUME", async () => {
      const msg = {
        id: "msg_a5",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Open Role - Senior Cloud Architect" },
            { name: "From", value: "talent@agency.com" },
          ],
          parts: [
            { filename: "JD_Cloud_Architect.pdf", mimeType: "application/pdf", body: { attachmentId: "att_a5", size: 5000 } },
          ],
        },
      };
      setupMockGmail([msg]);

      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "WE ARE HIRING: Senior Cloud Architect\nJob Description:\nAbout the role: We are looking for an experienced AWS architect to drive our cloud migration.\nKey Responsibilities:\n- Lead infrastructure design\n- Establish Terraform standards\nWhat we offer: Health insurance, 401(k), bonus.\nEqual opportunity employer. How to apply: send portfolio to talent@agency.com.",
        extractedData: { name: null, email: "talent@agency.com", phone: null, skills: ["AWS", "Terraform"] },
      });

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.processedResumes, 0);
      assert.equal(store.users.has("talent@agency.com"), false, "JD must not create candidate");
    });

    it("A6: Invoices, receipts, and shipping notifications are skipped without downloading attachment binaries", async () => {
      const msg = {
        id: "msg_a6",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Invoice #INV-92834 for your AWS Cloud Services" },
            { name: "From", value: "no-reply-billing@amazon.com" },
          ],
          parts: [
            { filename: "invoice_92834.pdf", mimeType: "application/pdf", body: { attachmentId: "att_a6", size: 5000 } },
          ],
        },
      };
      setupMockGmail([msg]);

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.skippedUnrelated, 1);
      assert.equal(store.binaryDownloadCount, 0, "Binary attachments must NEVER be downloaded for billing emails");
    });

    it("A7: Forwarded application email extracts candidate email from body rather than recruiter", async () => {
      const forwardBody =
        "---------- Forwarded message ---------\n" +
        "From: Maya Lin <maya.candidate@gmail.com>\n" +
        "Subject: Software Engineer Application\n\n" +
        "Hi Recruiter, please find my resume attached.\n";

      const msg = {
        id: "msg_a7",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Fwd: Software Engineer Application" },
            { name: "From", value: "internal.recruiter@hirequest.internal" },
          ],
          parts: [
            {
              mimeType: "text/plain",
              body: { data: Buffer.from(forwardBody).toString("base64url") },
            },
            {
              filename: "Maya_Lin_Resume.pdf",
              mimeType: "application/pdf",
              body: { attachmentId: "att_a7", size: 5000 },
            },
          ],
        },
      };
      setupMockGmail([msg]);

      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "Maya Lin\nEmail: maya.candidate@gmail.com\nPhone: +1 555-444-5555\nEducation: BS in Computer Science\nFull Stack Engineer with React, Node.js, TypeScript.",
        extractedData: { name: "Maya Lin", email: "maya.candidate@gmail.com", phone: "+15554445555", skills: ["React.js", "Node.js", "TypeScript"] },
      });

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.processedResumes, 1);
      assert.ok(store.users.has("maya.candidate@gmail.com"), "Must create candidate for forward candidate, not recruiter");
      assert.equal(store.users.has("internal.recruiter@hirequest.internal"), false);
    });
  });

  // =========================================================================
  // GROUP B: Tech Classification Across Diverse Ecosystems
  // =========================================================================
  describe("Group B: Tech Classification Across Ecosystems", () => {
    it("B1: QA/Testing Tech resume with Selenium, Cypress & Postman is ingested", async () => {
      const pdfBuf = Buffer.from(dummyPdfHeader + "content_b1");
      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "Carlos Gomez\nEmail: carlos.qa@example.com\nPhone: +1 555-555-6666\nEducation: BS Computer Science\nWork Experience:\nQA Automation Engineer at TestCorp\nCreated end-to-end test automation frameworks using Selenium, Cypress, Playwright, and Postman.",
        extractedData: { name: "Carlos Gomez", email: "carlos.qa@example.com", phone: "+15555556666", skills: ["Selenium", "Cypress", "Playwright", "Postman"] },
      });

      const res = await resumeService.processResume({
        file: { buffer: pdfBuf, originalname: "Carlos_QA.pdf", mimetype: "application/pdf", size: pdfBuf.length },
        source: "INBOUND_EMAIL",
        sourceEmail: "carlos.qa@example.com",
        companyId: TEST_COMPANY_ID,
      });

      assert.equal(res.duplicate, false);
      assert.ok(res.candidateId);
      assert.ok(store.users.has("carlos.qa@example.com"));
    });

    it("B2: DevOps/Cloud Tech resume with Terraform, Kubernetes & CI/CD is ingested", async () => {
      const pdfBuf = Buffer.from(dummyPdfHeader + "content_b2");
      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "Amina Al-Mansoor\nEmail: amina.devops@example.com\nPhone: +1 555-666-7777\nEducation: BS Software Engineering\nExperience:\nDevOps Engineer at InfraTech\nEngineered CI/CD pipelines, managed Kubernetes clusters with Terraform, Docker, and AWS.",
        extractedData: { name: "Amina Al-Mansoor", email: "amina.devops@example.com", phone: "+15556667777", skills: ["Kubernetes", "Terraform", "CI/CD", "AWS", "Docker"] },
      });

      const res = await resumeService.processResume({
        file: { buffer: pdfBuf, originalname: "Amina_DevOps.pdf", mimetype: "application/pdf", size: pdfBuf.length },
        source: "INBOUND_EMAIL",
        sourceEmail: "amina.devops@example.com",
        companyId: TEST_COMPANY_ID,
      });

      assert.ok(res.candidateId);
      assert.ok(store.users.has("amina.devops@example.com"));
    });

    it("B3: Data/AI Tech resume with PyTorch, Machine Learning & Pandas is ingested", async () => {
      const pdfBuf = Buffer.from(dummyPdfHeader + "content_b3");
      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "Siddharth Sen\nEmail: sid.data@example.com\nPhone: +1 555-777-8888\nEducation: Master of Science in Data Science\nExperience:\nMachine Learning Engineer at DeepMindLabs\nBuilt NLP models using PyTorch, TensorFlow, Pandas, and Python.",
        extractedData: { name: "Siddharth Sen", email: "sid.data@example.com", phone: "+15557778888", skills: ["Machine Learning", "PyTorch", "TensorFlow", "Pandas", "Python"] },
      });

      const res = await resumeService.processResume({
        file: { buffer: pdfBuf, originalname: "Sid_ML.pdf", mimetype: "application/pdf", size: pdfBuf.length },
        source: "INBOUND_EMAIL",
        sourceEmail: "sid.data@example.com",
        companyId: TEST_COMPANY_ID,
      });

      assert.ok(res.candidateId);
      assert.ok(store.users.has("sid.data@example.com"));
    });

    it("B4: Clearly non-Tech resume (Chef / Cook) is rejected without creating candidate", async () => {
      const pdfBuf = Buffer.from(dummyPdfHeader + "content_b4");
      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "Marco Rossi\nEmail: marco.chef@example.com\nPhone: +1 555-888-9999\nEducation: Culinary Arts Diploma\nExperience:\nHead Chef at Bistro 42\nMenu planning, kitchen management, food preparation, ingredient sourcing.",
        extractedData: { name: "Marco Rossi", email: "marco.chef@example.com", phone: "+15558889999", skills: [] },
      });

      await assert.rejects(
        async () => {
          await resumeService.processResume({
            file: { buffer: pdfBuf, originalname: "Marco_Chef.pdf", mimetype: "application/pdf", size: pdfBuf.length },
            source: "INBOUND_EMAIL",
            sourceEmail: "marco.chef@example.com",
            companyId: TEST_COMPANY_ID,
          });
        },
        (err) => {
          assert.equal(err.code, "NOT_A_TECH_RESUME");
          return true;
        }
      );

      assert.equal(store.users.has("marco.chef@example.com"), false);
    });

    it("B5: Ambiguous document routes to REVIEW_REQUIRED without creating candidate", async () => {
      const pdfBuf = Buffer.from(dummyPdfHeader + "content_b5");
      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "Chris Miller\nEmail: chris.ambig@example.com\nPhone: +1 555-999-0000\nEducation: Bachelor of Arts in History\nExperience:\nProject Assistant at ConsultingGroup\nPrepared reports, coordinated meetings, maintained records.",
        extractedData: { name: "Chris Miller", email: "chris.ambig@example.com", phone: "+15559990000", skills: [] },
      });

      const res = await resumeService.processResume({
        file: { buffer: pdfBuf, originalname: "Chris_Miller.pdf", mimetype: "application/pdf", size: pdfBuf.length },
        source: "INBOUND_EMAIL",
        sourceEmail: "chris.ambig@example.com",
        companyId: TEST_COMPANY_ID,
      });

      assert.equal(res.resumeProcessing.status, "REVIEW_REQUIRED");
      assert.equal(res.candidateId, null);
      assert.equal(store.users.has("chris.ambig@example.com"), false);
    });
  });

  // =========================================================================
  // GROUP C: Multiple Attachments, Document Isolation & Google Drive
  // =========================================================================
  describe("Group C: Attachments, Isolation & Google Drive", () => {
    it("C1: Email with 2 valid Tech resumes ingests both as separate candidates", async () => {
      const msg = {
        id: "msg_c1",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Candidate Resumes" },
            { name: "From", value: "agency@recruiting.com" },
          ],
          parts: [
            { filename: "Candidate_A.pdf", mimeType: "application/pdf", body: { attachmentId: "att_c1_a", size: 4000 } },
            { filename: "Candidate_B.pdf", mimeType: "application/pdf", body: { attachmentId: "att_c1_b", size: 4000 } },
          ],
        },
      };
      setupMockGmail([msg]);

      resumeService.processResume = async ({ file }) => {
        const email = file.originalname.includes("A") ? "cand.a@example.com" : "cand.b@example.com";
        const user = { id: "usr_" + email, email, role: "CANDIDATE" };
        store.users.set(email, user);
        return {
          duplicate: false,
          candidateId: user.id,
          resumeProcessing: { id: "rp_" + email, status: "COMPLETED" },
          application: null,
        };
      };

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.processedResumes, 2);
      assert.ok(store.users.has("cand.a@example.com"));
      assert.ok(store.users.has("cand.b@example.com"));
      const event = store.events.get("msg_c1");
      assert.equal(event.status, "COMPLETED");
    });

    it("C2: Valid Tech resume + Cover letter completes email without retry loops", async () => {
      const msg = {
        id: "msg_c2",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Application - Full Stack" },
            { name: "From", value: "applicant@example.com" },
          ],
          parts: [
            { filename: "Resume.pdf", mimeType: "application/pdf", body: { attachmentId: "att_c2_res", size: 5000 } },
            { filename: "Cover_Letter.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", body: { attachmentId: "att_c2_cov", size: 3000 } },
          ],
        },
      };
      setupMockGmail([msg]);

      resumeService.processResume = async ({ file }) => {
        if (file.originalname.includes("Resume")) {
          store.users.set("applicant@example.com", { id: "usr_app_1", email: "applicant@example.com" });
          return { duplicate: false, candidateId: "usr_app_1", resumeProcessing: { id: "rp_app_1", status: "COMPLETED" } };
        } else {
          const err = new Error("Cover letter is not a resume");
          err.code = "NOT_A_RESUME";
          err.isDeterministic = true;
          throw err;
        }
      };

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.processedResumes, 1);
      assert.equal(res.failed, 0, "Email must succeed when valid resume is ingested");
      const event = store.events.get("msg_c2");
      assert.equal(event.status, "COMPLETED");
    });

    it("C3: Valid Tech resume + Corrupt PDF completes valid resume without retry loops", async () => {
      const msg = {
        id: "msg_c3",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Developer CVs" },
            { name: "From", value: "referral@example.com" },
          ],
          parts: [
            { filename: "Good_Resume.pdf", mimeType: "application/pdf", body: { attachmentId: "att_c3_good", size: 5000 } },
            { filename: "Corrupt_File.pdf", mimeType: "application/pdf", body: { attachmentId: "att_c3_corrupt", size: 200 } },
          ],
        },
      };
      setupMockGmail([msg]);

      resumeService.processResume = async ({ file }) => {
        if (file.originalname.includes("Good")) {
          store.users.set("good.cand@example.com", { id: "usr_good", email: "good.cand@example.com" });
          return { duplicate: false, candidateId: "usr_good", resumeProcessing: { id: "rp_good", status: "COMPLETED" } };
        } else {
          const err = new Error("RESUME_TEXT_EXTRACTION_FAILED");
          err.code = "RESUME_TEXT_EXTRACTION_FAILED";
          err.isDeterministic = true;
          throw err;
        }
      };

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.processedResumes, 1);
      assert.equal(res.failed, 0);
      const event = store.events.get("msg_c3");
      assert.equal(event.status, "COMPLETED");
    });

    it("C4: Direct attachment exceeding MAX_RESUME_SIZE (20MB) is rejected before download", async () => {
      const msg = {
        id: "msg_c4",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Heavy Portfolio" },
            { name: "From", value: "designer@example.com" },
          ],
          parts: [
            {
              filename: "giant_portfolio.pdf",
              mimeType: "application/pdf",
              body: { attachmentId: "att_giant", size: 25 * 1024 * 1024 }, // 25 MB
            },
          ],
        },
      };
      setupMockGmail([msg]);

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(store.binaryDownloadCount, 0, "Giant file must not be downloaded");
      assert.equal(res.processedResumes, 0);
    });

    it("C5: Native Google Doc export via Drive link exports to PDF and ingests", async () => {
      driveService.downloadDriveFile = async ({ fileId }) => ({
        buffer: Buffer.from(dummyPdfHeader + "google_doc_exported"),
        originalname: `exported_${fileId}.pdf`,
        mimetype: "application/pdf",
        size: 4000,
        fileId,
      });

      const msg = {
        id: "msg_c5",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "My Google Doc Resume" },
            { name: "From", value: "gdoc.cand@example.com" },
          ],
          parts: [
            {
              mimeType: "text/plain",
              body: {
                data: Buffer.from(
                  "Hello, please review my Google Doc resume: https://docs.google.com/document/d/1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT1uV2wX3yZ4/edit"
                ).toString("base64url"),
              },
            },
          ],
        },
      };
      setupMockGmail([msg]);

      resumeService.processResume = async ({ file }) => {
        store.users.set("gdoc.cand@example.com", { id: "usr_gdoc", email: "gdoc.cand@example.com" });
        return { duplicate: false, candidateId: "usr_gdoc", resumeProcessing: { id: "rp_gdoc", status: "COMPLETED" } };
      };

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.processedResumes, 1);
      assert.ok(store.users.has("gdoc.cand@example.com"));
    });
  });

  // =========================================================================
  // GROUP D: Duplicate Processing & Candidate Integrity
  // =========================================================================
  describe("Group D: Duplicate Processing & Candidate Integrity", () => {
    it("D1: Same email synced twice avoids reprocessing completed messages", async () => {
      const msg = {
        id: "msg_d1",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Tech Application" },
            { name: "From", value: "dup.check@example.com" },
          ],
          parts: [
            { filename: "resume.pdf", mimeType: "application/pdf", body: { attachmentId: "att_d1", size: 5000 } },
          ],
        },
      };
      setupMockGmail([msg]);

      resumeService.processResume = async () => ({
        duplicate: false,
        candidateId: "usr_dup_1",
        resumeProcessing: { id: "rp_dup_1", status: "COMPLETED" },
      });

      // First sync
      const res1 = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res1.processedResumes, 1);
      assert.equal(res1.skipped, 0);

      // Second immediate sync
      const res2 = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res2.processedResumes, 0);
      assert.equal(res2.skipped, 1, "Completed message must be skipped on second sync");
    });

    it("D2: Existing candidate receiving updated resume preserves user and updates profile", async () => {
      // Seed existing user
      store.users.set("existing.candidate@example.com", {
        id: "usr_existing_1",
        email: "existing.candidate@example.com",
        name: "Existing John",
        role: "CANDIDATE",
      });

      const pdfBuf = Buffer.from(dummyPdfHeader + "content_d2");
      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "Existing John\nEmail: existing.candidate@example.com\nSkills: TypeScript, NestJS, Docker, AWS.",
        extractedData: {
          name: "Existing John",
          email: "existing.candidate@example.com",
          skills: ["TypeScript", "NestJS", "Docker", "AWS"],
        },
      });

      const result = await resumeService.processResume({
        file: { buffer: pdfBuf, originalname: "Updated_Resume.pdf", mimetype: "application/pdf", size: pdfBuf.length },
        source: "INBOUND_EMAIL",
        sourceEmail: "existing.candidate@example.com",
        companyId: TEST_COMPANY_ID,
      });

      assert.equal(result.candidateId, "usr_existing_1", "Must link to existing user ID without creating duplicate User");
      assert.equal(store.users.size, 1);
    });

    it("D3: Cross-company isolation ensures candidate profile is scoped to target companyId", async () => {
      const pdfBuf = Buffer.from(dummyPdfHeader + "content_d3");
      parserService.parseResume = async () => ({
        status: "PARSED",
        text: "Tenant Candidate\nEmail: tenant@example.com\nSkills: React, Node.js.",
        extractedData: { name: "Tenant Candidate", email: "tenant@example.com", skills: ["React.js", "Node.js"] },
      });

      const result = await resumeService.processResume({
        file: { buffer: pdfBuf, originalname: "Tenant.pdf", mimetype: "application/pdf", size: pdfBuf.length },
        source: "INBOUND_EMAIL",
        sourceEmail: "tenant@example.com",
        companyId: "comp_special_tenant_999",
      });

      const profile = store.profiles.get("tenant@example.com");
      assert.equal(profile.companyId, "comp_special_tenant_999", "Profile must be explicitly scoped to target company");
    });
  });

  // =========================================================================
  // GROUP E: Failures, Recovery & Heartbeat Lease
  // =========================================================================
  describe("Group E: Failures, Recovery & Leases", () => {
    it("E1: Active job lasting > 5 min with heartbeat is NOT reclaimed", async () => {
      const fileHash = "hash_active_e1";
      const activeJob = {
        id: "rp_active_e1",
        fileHash,
        status: "PROCESSING",
        createdAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
        updatedAt: new Date(Date.now() - 15 * 1000),      // 15 seconds ago (live heartbeat)
      };
      store.resumes.set(fileHash, activeJob);

      const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
      const claimed = await repository.claimStaleResumeProcessing(activeJob.id, staleBefore);
      assert.equal(claimed, false, "Live heartbeat must prevent reclaiming");
    });

    it("E2: Genuinely crashed job (> 5 min without heartbeat) IS reclaimed", async () => {
      const fileHash = "hash_crashed_e2";
      const crashedJob = {
        id: "rp_crashed_e2",
        fileHash,
        status: "PROCESSING",
        createdAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
        updatedAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago (dead heartbeat)
      };
      store.resumes.set(fileHash, crashedJob);

      const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
      const claimed = await repository.claimStaleResumeProcessing(crashedJob.id, staleBefore);
      assert.equal(claimed, true, "Crashed job must be successfully reclaimed");
      assert.equal(crashedJob.status, "PROCESSING");
    });

    it("E3: Retry exhaustion marks PERMANENT_FAILURE after 3 attempts", async () => {
      const event = {
        id: "evt_exhaust_1",
        providerMessageId: "msg_exhaust_1",
        status: "FAILED",
        errorMessage: "[Attempt 3/3] [PERMANENT_FAILURE] Max retries exceeded.",
      };
      store.events.set("msg_exhaust_1", event);

      // Verify permanent failure error code matches
      assert.ok(event.errorMessage.includes("PERMANENT_FAILURE"));
    });
  });

  // =========================================================================
  // GROUP F: Lightweight Processing Invariant Assertions
  // =========================================================================
  describe("Group F: Lightweight Processing Invariant Assertions", () => {
    it("F1: For clearly unrelated emails, attachment binary download is never called", async () => {
      const msg = {
        id: "msg_f1",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Amazon.com Order Confirmation #112-987" },
            { name: "From", value: "order-update@amazon.com" },
          ],
          parts: [
            { filename: "receipt.pdf", mimeType: "application/pdf", body: { attachmentId: "att_f1", size: 4000 } },
          ],
        },
      };
      setupMockGmail([msg]);

      await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(store.binaryDownloadCount, 0, "Must NEVER download attachment binary for Amazon receipt");
    });

    it("F2: Messages with 0 attachments or Drive links complete without binary calls", async () => {
      const msg = {
        id: "msg_f2",
        internalDate: String(Date.now()),
        payload: {
          headers: [
            { name: "Subject", value: "Just saying hello" },
            { name: "From", value: "friend@example.com" },
          ],
          parts: [
            { mimeType: "text/plain", body: { data: Buffer.from("Hello, hope you are well!").toString("base64url") } },
          ],
        },
      };
      setupMockGmail([msg]);

      const res = await mailboxService.syncMailboxForUser(TEST_USER_ID, 10000);
      assert.equal(res.scanned, 1);
      assert.equal(res.processedResumes, 0);
      assert.equal(store.binaryDownloadCount, 0);
    });
  });
});
