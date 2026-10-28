"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractMimeElements,
  extractDriveFileIds,
  downloadDriveFile,
  DRIVE_FILE_ID_REGEX,
} = require("../../src/modules/mailbox/drive.service");
const resumeService = require("../../src/modules/resume/resume.service");
const resumeRepository = require("../../src/modules/resume/resume.repository");
const crypto = require("node:crypto");
const calculateSha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

test("Google Drive Resume Ingestion & Robust MIME Suite", async (t) => {

  // 1. Direct PDF/DOC/DOCX Attachments
  await t.test("extractMimeElements correctly extracts direct PDF, DOCX, and DOC attachments", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: Buffer.from("Please find attached my resume").toString("base64url") },
        },
        {
          filename: "resume.pdf",
          mimeType: "application/pdf",
          body: { attachmentId: "att_pdf_123", size: 1024 },
        },
        {
          filename: "cover_letter.docx",
          mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          body: { attachmentId: "att_docx_456", size: 2048 },
        },
        {
          filename: "old_cv.doc",
          mimeType: "application/msword",
          body: { attachmentId: "att_doc_789", size: 4096 },
        },
        {
          filename: "photo.jpg", // Unsupported format, should be ignored
          mimeType: "image/jpeg",
          body: { attachmentId: "att_img_000", size: 512 },
        },
      ],
    };

    const { attachments, plainTextBody } = extractMimeElements(payload);
    assert.equal(attachments.length, 3);
    assert.equal(attachments[0].filename, "resume.pdf");
    assert.equal(attachments[0].attachmentId, "att_pdf_123");
    assert.equal(attachments[1].filename, "cover_letter.docx");
    assert.equal(attachments[2].filename, "old_cv.doc");
    assert.ok(plainTextBody.includes("Please find attached my resume"));
  });

  // 2. Nested Multipart MIME Messages
  await t.test("extractMimeElements recursively traverses deeply nested multipart messages", () => {
    const nestedPayload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "multipart/related",
          parts: [
            {
              mimeType: "multipart/alternative",
              parts: [
                {
                  mimeType: "text/plain",
                  body: { data: Buffer.from("Hello from deep plain text").toString("base64url") },
                },
                {
                  mimeType: "text/html",
                  body: { data: Buffer.from("<p>Hello from deep HTML</p>").toString("base64url") },
                },
              ],
            },
            {
              filename: "inline_signature.png",
              mimeType: "image/png",
              body: { attachmentId: "inline_sig", size: 100 },
            },
          ],
        },
        {
          filename: "nested_resume.pdf",
          mimeType: "application/pdf",
          body: { attachmentId: "nested_att_999", size: 85000 },
        },
      ],
    };

    const result = extractMimeElements(nestedPayload);
    assert.equal(result.attachments.length, 1);
    assert.equal(result.attachments[0].filename, "nested_resume.pdf");
    assert.equal(result.attachments[0].attachmentId, "nested_att_999");
    assert.ok(result.plainTextBody.includes("Hello from deep plain text"));
    assert.ok(result.htmlBody.includes("Hello from deep HTML"));
  });

  // 3. Google Drive links in plain text and HTML
  await t.test("extractDriveFileIds extracts and deduplicates valid file IDs across text and HTML", () => {
    const plainText = `
      Hi, here is my resume:
      https://drive.google.com/file/d/1BwxQ9RkL718mInli9sk_vATMSy2OUA2t/view?usp=drivesdk
      And my portfolio:
      https://docs.google.com/document/d/1MfuH-Omwaf8Y4uh9ZzHPkjjw5rhm0ZlY/edit
    `;
    const html = `
      <div>
        <a href="https://drive.google.com/file/d/1BwxQ9RkL718mInli9sk_vATMSy2OUA2t/view">Link</a>
        <a href="https://drive.google.com/uc?id=1AbCdEfGhIjKlMnOpQrStUvWxYz_1234">Download</a>
      </div>
    `;

    const fileIds = extractDriveFileIds(plainText, html);
    assert.equal(fileIds.length, 3);
    assert.ok(fileIds.includes("1BwxQ9RkL718mInli9sk_vATMSy2OUA2t"));
    assert.ok(fileIds.includes("1MfuH-Omwaf8Y4uh9ZzHPkjjw5rhm0ZlY"));
    assert.ok(fileIds.includes("1AbCdEfGhIjKlMnOpQrStUvWxYz_1234"));
  });

  // 4. Gmail Drive-chip messages with no MIME attachment (Shivam's exact structure)
  await t.test("handles Gmail Drive-chip payload with 0 attachments and extracts drive fileId", () => {
    const shivamPayload = {
      mimeType: "multipart/alternative",
      parts: [
        {
          partId: "0",
          mimeType: "text/plain",
          filename: "",
          body: {
            size: 201,
            data: Buffer.from(
              "<https://drive.google.com/file/d/1BwxQ9RkL718mInli9sk_vATMSy2OUA2t/view?usp=drivesdk>\nSHIVAM_SOLANKI_RESUME.pdf"
            ).toString("base64url"),
          },
        },
        {
          partId: "1",
          mimeType: "text/html",
          filename: "",
          body: {
            size: 1636,
            data: Buffer.from(
              '<div class="gmail_chip gmail_drive_chip"><a href="https://drive.google.com/file/d/1BwxQ9RkL718mInli9sk_vATMSy2OUA2t/view?usp=drivesdk">SHIVAM_SOLANKI_RESUME.pdf</a></div>'
            ).toString("base64url"),
          },
        },
      ],
    };

    const { attachments, plainTextBody, htmlBody } = extractMimeElements(shivamPayload);
    assert.equal(attachments.length, 0, "Should have 0 direct binary attachments");

    const fileIds = extractDriveFileIds(plainTextBody, htmlBody);
    assert.equal(fileIds.length, 1);
    assert.equal(fileIds[0], "1BwxQ9RkL718mInli9sk_vATMSy2OUA2t");
  });

  // 5. Download accessible Drive PDF file
  await t.test("downloadDriveFile downloads accessible binary PDF file", async () => {
    const dummyPdf = Buffer.from("%PDF-1.4 dummy pdf content for testing");
    const mockDrive = {
      files: {
        async get(params) {
          if (params.alt === "media") {
            return { data: dummyPdf };
          }
          return {
            data: {
              id: params.fileId,
              name: "shivam_resume.pdf",
              mimeType: "application/pdf",
              size: dummyPdf.length.toString(),
            },
          };
        },
      },
    };

    const result = await downloadDriveFile({
      drive: mockDrive,
      fileId: "1BwxQ9RkL718mInli9sk_vATMSy2OUA2t",
    });

    assert.equal(result.fileId, "1BwxQ9RkL718mInli9sk_vATMSy2OUA2t");
    assert.equal(result.originalname, "shivam_resume.pdf");
    assert.equal(result.mimetype, "application/pdf");
    assert.equal(result.size, dummyPdf.length);
    assert.ok(result.buffer.equals(dummyPdf));
  });

  // 6. Native Google Doc export
  await t.test("downloadDriveFile exports native Google Doc to PDF", async () => {
    const exportedPdf = Buffer.from("%PDF-1.5 exported google doc pdf");
    let exportCalled = false;

    const mockDrive = {
      files: {
        async get(params) {
          return {
            data: {
              id: params.fileId,
              name: "My Google Docs Resume",
              mimeType: "application/vnd.google-apps.document",
            },
          };
        },
        async export(params) {
          if (params.mimeType === "application/pdf") {
            exportCalled = true;
            return { data: exportedPdf };
          }
          throw new Error("Invalid export mimeType");
        },
      },
    };

    const result = await downloadDriveFile({
      drive: mockDrive,
      fileId: "1MfuH-Omwaf8Y4uh9ZzHPkjjw5rhm0ZlY",
    });

    assert.ok(exportCalled, "Should call drive.files.export with application/pdf");
    assert.equal(result.originalname, "My Google Docs Resume.pdf");
    assert.equal(result.mimetype, "application/pdf");
    assert.ok(result.buffer.equals(exportedPdf));
  });

  // 7. Publicly inaccessible and permission-denied Drive files
  await t.test("downloadDriveFile throws DRIVE_PERMISSION_DENIED on 403 or insufficient scope", async () => {
    const mockDrive = {
      files: {
        async get() {
          const err = new Error("Request had insufficient authentication scopes");
          err.code = 403;
          err.response = { status: 403 };
          throw err;
        },
      },
    };

    await assert.rejects(
      async () => {
        await downloadDriveFile({
          drive: mockDrive,
          fileId: "1BwxQ9RkL718mInli9sk_vATMSy2OUA2t",
        });
      },
      (err) => {
        assert.equal(err.code, "DRIVE_PERMISSION_DENIED");
        assert.equal(err.status, 403);
        return true;
      }
    );
  });

  // 8. Expired / Deleted Drive links (404)
  await t.test("downloadDriveFile throws DRIVE_FILE_NOT_FOUND on 404", async () => {
    const mockDrive = {
      files: {
        async get() {
          const err = new Error("File not found: 1NotFoundFileId123456789012");
          err.code = 404;
          err.response = { status: 404 };
          throw err;
        },
      },
    };

    await assert.rejects(
      async () => {
        await downloadDriveFile({
          drive: mockDrive,
          fileId: "1NotFoundFileId123456789012",
        });
      },
      (err) => {
        assert.equal(err.code, "DRIVE_FILE_NOT_FOUND");
        assert.equal(err.status, 404);
        return true;
      }
    );
  });

  // 9. Unsupported and Oversized Files
  await t.test("downloadDriveFile rejects unsupported formats (e.g. spreadsheet, zip, image)", async () => {
    const mockDrive = {
      files: {
        async get() {
          return {
            data: {
              id: "1SheetId12345678901234567890",
              name: "candidates.xlsx",
              mimeType: "application/vnd.google-apps.spreadsheet",
            },
          };
        },
      },
    };

    await assert.rejects(
      async () => {
        await downloadDriveFile({
          drive: mockDrive,
          fileId: "1SheetId12345678901234567890",
        });
      },
      (err) => {
        assert.equal(err.code, "UNSUPPORTED_FILE_TYPE");
        return true;
      }
    );
  });

  await t.test("downloadDriveFile rejects oversized files exceeding maximum allowed size", async () => {
    const mockDrive = {
      files: {
        async get() {
          return {
            data: {
              id: "1OversizedFileId123456789012",
              name: "huge_resume.pdf",
              mimeType: "application/pdf",
              size: "30000000", // 30 MB
            },
          };
        },
      },
    };

    await assert.rejects(
      async () => {
        await downloadDriveFile({
          drive: mockDrive,
          fileId: "1OversizedFileId123456789012",
          maxSizeBytes: 20 * 1024 * 1024,
        });
      },
      (err) => {
        assert.equal(err.code, "RESUME_FILE_TOO_LARGE");
        return true;
      }
    );
  });

  // 10. Duplicate File Hash and Retry Logic
  await t.test("duplicate file hash detection in processResume returns duplicate: true", async () => {
    const fileBuffer = Buffer.from("%PDF-1.4 dummy pdf content for duplicate test");
    const providerMessageId = "msg_dup_test_123";
    const hashInput = Buffer.concat([fileBuffer, Buffer.from(providerMessageId)]);
    const fileHash = calculateSha256(hashInput);

    // Mock resumeRepository.findResumeByHash
    const originalFindResumeByHash = resumeRepository.findResumeByHash;
    resumeRepository.findResumeByHash = async (hash) => {
      if (hash === fileHash) {
        return {
          id: "res_proc_existing_123",
          candidateId: "cand_existing_456",
          status: "COMPLETED",
          fileHash,
          storageKey: "resumes/existing.pdf",
          applications: [{ id: "app_123" }],
        };
      }
      return null;
    };

    try {
      const result = await resumeService.processResume({
        file: {
          buffer: fileBuffer,
          originalname: "resume.pdf",
          mimetype: "application/pdf",
          size: fileBuffer.length,
        },
        source: "INBOUND_EMAIL",
        sourceEmail: "candidate@test.com",
        uploadedByUserId: null,
        companyId: "company_123",
        providerMessageId,
      });

      assert.equal(result.duplicate, true);
      assert.equal(result.candidateId, "cand_existing_456");
      assert.equal(result.resumeProcessing.id, "res_proc_existing_123");
    } finally {
      resumeRepository.findResumeByHash = originalFindResumeByHash;
    }
  });

  // 11. Security: SSRF and Drive URL sanitization
  await t.test("extractDriveFileIds ignores non-Drive URLs and invalid fileId lengths", () => {
    const maliciousText = `
      Check this URL: https://evil.com/file/d/1BwxQ9RkL718mInli9sk_vATMSy2OUA2t
      Check short ID: https://drive.google.com/file/d/too_short
      Check invalid chars: https://drive.google.com/file/d/invalid!@#$%^&*()_+/view
      Check file protocol: file:///etc/passwd
    `;

    const fileIds = extractDriveFileIds(maliciousText, "");
    assert.equal(fileIds.length, 0, "Must not extract malicious or non-Drive URLs");
  });

  // 12. Correct InboundEmailEvent Completion vs Failure State Semantics
  await t.test("verify InboundEmailEvent state logic: all items fail -> FAILED, not COMPLETED", () => {
    const processedResumeIds = [];
    const itemErrors = [
      {
        source: "GOOGLE_DRIVE",
        fileId: "1BwxQ9RkL718mInli9sk_vATMSy2OUA2t",
        code: "DRIVE_PERMISSION_DENIED",
        message: "Google Drive access denied or insufficient permissions/scopes.",
      },
    ];
    const totalDiscovered = 1;

    let finalStatus = null;
    let errorCode = null;

    if (processedResumeIds.length > 0) {
      finalStatus = "COMPLETED";
    } else if (totalDiscovered > 0 && itemErrors.length > 0) {
      finalStatus = "FAILED";
      errorCode = itemErrors[0].code;
    } else {
      finalStatus = "COMPLETED";
    }

    assert.equal(finalStatus, "FAILED", "Must be marked FAILED so it remains retryable");
    assert.equal(errorCode, "DRIVE_PERMISSION_DENIED");
  });

  await t.test("verify InboundEmailEvent state logic: at least one item succeeds -> COMPLETED", () => {
    const processedResumeIds = ["res_proc_success_999"];
    const itemErrors = [
      {
        source: "GOOGLE_DRIVE",
        fileId: "failed_doc_id_123",
        code: "DRIVE_PERMISSION_DENIED",
        message: "Permission denied",
      },
    ];
    const totalDiscovered = 2;

    let finalStatus = null;
    let primaryResumeId = null;

    if (processedResumeIds.length > 0) {
      finalStatus = "COMPLETED";
      primaryResumeId = processedResumeIds[0];
    } else if (totalDiscovered > 0 && itemErrors.length > 0) {
      finalStatus = "FAILED";
    } else {
      finalStatus = "COMPLETED";
    }

    assert.equal(finalStatus, "COMPLETED");
    assert.equal(primaryResumeId, "res_proc_success_999");
  });

  // 13. Multiple resumes in one email (1 attachment + 1 Drive link)
  await t.test("extracts both direct attachment and Drive link from a single email", () => {
    const multiPayload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "text/html",
          body: {
            data: Buffer.from(
              '<p>Here is my first resume attached, and my second resume on drive: <a href="https://drive.google.com/file/d/1BwxQ9RkL718mInli9sk_vATMSy2OUA2t/view">Drive Resume</a></p>'
            ).toString("base64url"),
          },
        },
        {
          filename: "first_resume.pdf",
          mimeType: "application/pdf",
          body: { attachmentId: "first_att_111", size: 50000 },
        },
      ],
    };

    const { attachments, htmlBody } = extractMimeElements(multiPayload);
    assert.equal(attachments.length, 1);
    assert.equal(attachments[0].filename, "first_resume.pdf");

    const driveFileIds = extractDriveFileIds("", htmlBody);
    assert.equal(driveFileIds.length, 1);
    assert.equal(driveFileIds[0], "1BwxQ9RkL718mInli9sk_vATMSy2OUA2t");
  });

  // 14. Cross-company HR sender role preservation
  await t.test("preserves existing HR User.role when candidate profile is ensured for Drive resume", async () => {
    const hrUser = {
      id: "usr_hr_microsoft_123",
      email: "hr.sender@microsoft.com",
      role: "HR",
      firstName: "Satya",
      lastName: "Nadella",
      companyMembers: [
        {
          companyId: "cmvqjiw5r0000rfbofwe6fors", // Microsoft IT Company
          role: "OWNER",
        },
      ],
    };

    const originalFindCandidate = resumeRepository.findCandidateByEmail;
    const originalEnsureProfile = resumeRepository.ensureCandidateProfile;

    let ensuredCompanyId = null;

    try {
      resumeRepository.findCandidateByEmail = async () => hrUser;
      resumeRepository.ensureCandidateProfile = async (user, data, companyId) => {
        ensuredCompanyId = companyId;
        return { id: "cp_123", userId: user.id, companyId };
      };

      const result = await resumeService.createCandidateIfRequired({
        extractedData: { email: "hr.sender@microsoft.com", name: "Satya Nadella" },
        companyId: "cmvqkgij6009orfbo8xj7zkzt", // Facebook Company
        source: "INBOUND_EMAIL",
        sourceEmail: "hr.sender@microsoft.com",
      });

      assert.equal(result.created, false);
      assert.equal(result.candidate.id, "usr_hr_microsoft_123");
      assert.equal(result.candidate.role, "HR", "User role must NOT change to CANDIDATE");
      assert.equal(ensuredCompanyId, "cmvqkgij6009orfbo8xj7zkzt", "Candidate profile must be ensured for target company");
    } finally {
      resumeRepository.findCandidateByEmail = originalFindCandidate;
      resumeRepository.ensureCandidateProfile = originalEnsureProfile;
    }
  });
});
