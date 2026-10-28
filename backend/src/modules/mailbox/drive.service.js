"use strict";

const { google } = require("googleapis");
const {
  MAX_RESUME_SIZE,
  ALLOWED_RESUME_EXTENSIONS,
  ALLOWED_RESUME_MIME_TYPES,
} = require("../resume/resume.constants");

/**
 * Valid Google Drive file ID format:
 * Alphanumeric, underscores, hyphens, typically 25 to 60 characters long.
 */
const DRIVE_FILE_ID_REGEX = /^[a-zA-Z0-9_-]{25,60}$/;

/**
 * Recursively traverses a Gmail message payload (including nested multipart messages)
 * to extract all eligible resume attachments, plain-text body, and HTML body.
 *
 * @param {object} payload - Gmail message payload
 * @returns {{ attachments: Array<{filename: string, attachmentId: string, mimeType: string, size: number}>, plainTextBody: string, htmlBody: string }}
 */
function extractMimeElements(payload) {
  const attachments = [];
  let plainTextBody = "";
  let htmlBody = "";

  function traverse(part) {
    if (!part) return;

    // Direct binary attachment check
    if (part.filename && part.body && part.body.attachmentId) {
      const ext = ("." + (part.filename.split(".").pop() || "")).toLowerCase();
      if (ALLOWED_RESUME_EXTENSIONS.includes(ext)) {
        attachments.push({
          filename: part.filename,
          attachmentId: part.body.attachmentId,
          mimeType: part.mimeType,
          size: part.body.size || 0,
        });
      }
    }

    // Body content extraction (only if not an attachment with a filename)
    if (!part.filename) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        plainTextBody += Buffer.from(part.body.data, "base64url").toString("utf-8");
      } else if (part.mimeType === "text/html" && part.body?.data) {
        htmlBody += Buffer.from(part.body.data, "base64url").toString("utf-8");
      }
    }

    // Recursively process nested multipart parts
    if (Array.isArray(part.parts)) {
      for (const nestedPart of part.parts) {
        traverse(nestedPart);
      }
    }
  }

  traverse(payload);

  return {
    attachments,
    plainTextBody,
    htmlBody,
  };
}

/**
 * Extracts unique, valid Google Drive file IDs from plain-text and HTML email bodies.
 * Treats inputs as untrusted and strictly enforces format validation to prevent injection.
 *
 * @param {string} plainText
 * @param {string} html
 * @returns {string[]} Array of unique valid fileIds
 */
function extractDriveFileIds(plainText = "", html = "") {
  const fileIds = new Set();
  const textToScan = [plainText, html].filter(Boolean).join("\n");

  const patterns = [
    /https?:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/gi,
    /https?:\/\/drive\.google\.com\/(?:open|uc)\?(?:[^\s"'>]*&)?id=([a-zA-Z0-9_-]+)/gi,
    /https?:\/\/docs\.google\.com\/(?:document|file)\/d\/([a-zA-Z0-9_-]+)/gi,
  ];

  for (const regex of patterns) {
    let match;
    while ((match = regex.exec(textToScan)) !== null) {
      const candidateId = match[1];
      if (candidateId && DRIVE_FILE_ID_REGEX.test(candidateId)) {
        fileIds.add(candidateId);
      }
    }
  }

  return Array.from(fileIds);
}

/**
 * Creates an authenticated Google Drive API client using the OAuth2 client.
 *
 * @param {object} oauth2Client
 * @returns {object} Google Drive client
 */
function createDriveClient(oauth2Client) {
  return google.drive({ version: "v3", auth: oauth2Client });
}

/**
 * Securely downloads a file from Google Drive using the authenticated Drive API.
 * Never makes arbitrary HTTP requests. Supports native Google Docs (exported to PDF)
 * and direct PDF/DOCX/DOC files.
 *
 * @param {object} params
 * @param {object} params.drive - Google Drive API client
 * @param {string} params.fileId - Validated Google Drive file ID
 * @param {number} [params.maxSizeBytes] - Max allowed file size in bytes
 * @returns {Promise<{ buffer: Buffer, originalname: string, mimetype: string, size: number, fileId: string }>}
 */
async function downloadDriveFile({ drive, fileId, maxSizeBytes = MAX_RESUME_SIZE }) {
  if (!fileId || !DRIVE_FILE_ID_REGEX.test(fileId)) {
    const error = new Error("Invalid Google Drive file ID format");
    error.code = "INVALID_DRIVE_FILE_ID";
    error.status = 400;
    throw error;
  }

  // 1. Fetch file metadata
  let metadata;
  try {
    const metaRes = await drive.files.get({
      fileId,
      fields: "id, name, mimeType, size",
      supportsAllDrives: true,
    });
    metadata = metaRes.data;
  } catch (err) {
    const status = err.response?.status || err.code || err.status;
    const msg = String(err.message || "");
    const isPermissionError =
      status === 403 ||
      msg.toLowerCase().includes("insufficient") ||
      msg.toLowerCase().includes("permission") ||
      msg.toLowerCase().includes("access denied");

    if (isPermissionError) {
      const error = new Error(
        "Google Drive access denied or insufficient permissions/scopes. Re-consent with drive.readonly scope required."
      );
      error.code = "DRIVE_PERMISSION_DENIED";
      error.status = 403;
      throw error;
    }

    const isNotFoundError =
      status === 404 ||
      msg.toLowerCase().includes("not found") ||
      msg.toLowerCase().includes("deleted");

    if (isNotFoundError) {
      const error = new Error("Google Drive file not found or has been deleted");
      error.code = "DRIVE_FILE_NOT_FOUND";
      error.status = 404;
      throw error;
    }

    const error = new Error(`Google Drive metadata fetch failed: ${msg}`);
    error.code = "DRIVE_FETCH_FAILED";
    error.status = status || 500;
    throw error;
  }

  const mimeType = (metadata.mimeType || "").toLowerCase();
  const rawName = metadata.name || `resume_${fileId}`;
  const ext = ("." + (rawName.split(".").pop() || "")).toLowerCase();

  // 2. Validate supported file types
  const isGoogleDoc = mimeType === "application/vnd.google-apps.document";
  const isPdf = mimeType === "application/pdf" || ext === ".pdf";
  const isDocx =
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext === ".docx";
  const isDoc = mimeType === "application/msword" || ext === ".doc";

  if (!isGoogleDoc && !isPdf && !isDocx && !isDoc) {
    const error = new Error(
      `Unsupported Google Drive file type: ${mimeType || ext}. Only PDF, DOCX, and DOC resumes are supported.`
    );
    error.code = "UNSUPPORTED_FILE_TYPE";
    error.status = 415;
    throw error;
  }

  // Pre-check size if reported in metadata
  if (metadata.size) {
    const sizeBytes = parseInt(metadata.size, 10);
    if (!Number.isNaN(sizeBytes) && sizeBytes > maxSizeBytes) {
      const error = new Error("Google Drive file exceeds maximum allowed resume size");
      error.code = "RESUME_FILE_TOO_LARGE";
      error.status = 413;
      throw error;
    }
  }

  // 3. Download / Export content
  let buffer;
  let finalMimeType = mimeType;
  let finalFilename = rawName;

  try {
    if (isGoogleDoc) {
      // Export native Google Docs to PDF
      const exportRes = await drive.files.export(
        {
          fileId,
          mimeType: "application/pdf",
        },
        { responseType: "arraybuffer" }
      );
      buffer = Buffer.from(exportRes.data);
      finalMimeType = "application/pdf";
      if (!finalFilename.toLowerCase().endsWith(".pdf")) {
        finalFilename = `${finalFilename}.pdf`;
      }
    } else {
      // Download binary file content
      const downloadRes = await drive.files.get(
        {
          fileId,
          alt: "media",
          supportsAllDrives: true,
        },
        { responseType: "arraybuffer" }
      );
      buffer = Buffer.from(downloadRes.data);
      if (isPdf) finalMimeType = "application/pdf";
      else if (isDocx)
        finalMimeType =
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      else if (isDoc) finalMimeType = "application/msword";
    }
  } catch (err) {
    const status = err.response?.status || err.code || err.status;
    const msg = String(err.message || "");
    if (
      status === 403 ||
      msg.toLowerCase().includes("insufficient") ||
      msg.toLowerCase().includes("permission")
    ) {
      const error = new Error(
        "Google Drive file download permission denied. The connected account cannot read this file."
      );
      error.code = "DRIVE_DOWNLOAD_DENIED";
      error.status = 403;
      throw error;
    }
    const error = new Error(`Google Drive download failed: ${msg}`);
    error.code = "DRIVE_DOWNLOAD_FAILED";
    error.status = status || 500;
    throw error;
  }

  // Post-check actual buffer size
  if (!buffer || buffer.length === 0) {
    const error = new Error("Downloaded Google Drive file is empty");
    error.code = "RESUME_FILE_EMPTY";
    error.status = 400;
    throw error;
  }

  if (buffer.length > maxSizeBytes) {
    const error = new Error("Downloaded Google Drive file exceeds maximum allowed resume size");
    error.code = "RESUME_FILE_TOO_LARGE";
    error.status = 413;
    throw error;
  }

  return {
    buffer,
    originalname: finalFilename,
    mimetype: finalMimeType,
    size: buffer.length,
    fileId,
  };
}

module.exports = {
  extractMimeElements,
  extractDriveFileIds,
  createDriveClient,
  downloadDriveFile,
  DRIVE_FILE_ID_REGEX,
};
