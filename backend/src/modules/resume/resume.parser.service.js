"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

let pdfParse;
let mammoth;

try {
  pdfParse = require("pdf-parse");
} catch (_) {
  pdfParse = null;
}

try {
  mammoth = require("mammoth");
} catch (_) {
  mammoth = null;
}

const {
  REGEX,
  SKILL_DICTIONARY,
  SUPPORTED_RESUME_TYPES,
} = require("./resume.constants");

function normalizeText(text) {
  return String(text || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeEmail(email) {
  return email ? email.trim().toLowerCase() : null;
}

function normalizePhone(phone) {
  if (!phone) {
    return null;
  }

  const normalized = phone.replace(/[^\d+]/g, "").trim();

  if (normalized.replace(/\D/g, "").length < 10) {
    return null;
  }

  return normalized;
}

function extractEmail(text) {
  const matches = text.match(REGEX.EMAIL);

  if (!matches?.length) {
    return null;
  }

  return normalizeEmail(matches[0]);
}

function extractPhone(text) {
  const matches = text.match(REGEX.PHONE);

  if (!matches?.length) {
    return null;
  }

  for (const candidate of matches) {
    const phone = normalizePhone(candidate);
    if (phone) {
      return phone;
    }
  }

  return null;
}

function extractName(text, email) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 15);

  for (const line of lines) {
    if (line.length < 2 || line.length > 100) {
      continue;
    }

    if (REGEX.EMAIL.test(line) || REGEX.PHONE.test(line)) {
      continue;
    }

    if (/^(resume|cv|curriculum vitae)$/i.test(line)) {
      continue;
    }

    if (/^(summary|profile|objective|experience|skills|education)$/i.test(line)) {
      continue;
    }

    if (email && line.toLowerCase().includes(email.toLowerCase())) {
      continue;
    }

    const words = line.split(/\s+/);

    if (
      words.length >= 2 &&
      words.length <= 6 &&
      words.every((word) => /^[A-Za-z.'-]+$/.test(word))
    ) {
      return line;
    }
  }

  return null;
}

function extractSkills(text) {
  const normalizedText = text.toLowerCase();
  const found = new Map();

  for (const skill of SKILL_DICTIONARY) {
    const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const regex = new RegExp(
      `(^|[^a-z0-9+#.])${escapedSkill}(?=$|[^a-z0-9+#.])`,
      "i"
    );

    if (regex.test(normalizedText)) {
      found.set(skill.toLowerCase(), skill);
    }
  }

  return [...found.values()].sort((a, b) => a.localeCompare(b));
}

function extractExperienceYears(text) {
  const matches = [...text.matchAll(REGEX.YEARS_EXPERIENCE)];

  if (!matches.length) {
    return null;
  }

  const values = matches
    .map((match) => Number.parseFloat(match[1]))
    .filter(Number.isFinite)
    .filter((value) => value >= 0 && value <= 70);

  if (!values.length) {
    return null;
  }

  return Math.max(...values);
}

async function extractPdfText(buffer) {
  try {
    if (!pdfParse) {
      return normalizeText(buffer.toString("utf-8"));
    }

    const result = await pdfParse(buffer);
    const text = normalizeText(result.text);

    if (!text) {
      throw new Error("PDF_TEXT_EMPTY");
    }

    return text;
  } catch (error) {
    const wrapped = new Error("RESUME_TEXT_EXTRACTION_FAILED");
    wrapped.code = "RESUME_TEXT_EXTRACTION_FAILED";
    wrapped.cause = error;
    throw wrapped;
  }
}

async function extractDocxText(buffer) {
  try {
    if (!mammoth) {
      return normalizeText(buffer.toString("utf-8"));
    }

    const result = await mammoth.extractRawText({ buffer });
    const text = normalizeText(result.value);

    if (!text) {
      throw new Error("DOCX_TEXT_EMPTY");
    }

    return text;
  } catch (error) {
    const wrapped = new Error("RESUME_TEXT_EXTRACTION_FAILED");
    wrapped.code = "RESUME_TEXT_EXTRACTION_FAILED";
    wrapped.cause = error;
    throw wrapped;
  }
}

function detectFileType({ mimetype, originalname }) {
  const extension = path.extname(originalname || "").toLowerCase();

  if (
    mimetype === SUPPORTED_RESUME_TYPES.PDF.mimeType &&
    extension === ".pdf"
  ) {
    return "PDF";
  }

  if (
    mimetype === SUPPORTED_RESUME_TYPES.DOCX.mimeType &&
    extension === ".docx"
  ) {
    return "DOCX";
  }

  const error = new Error("RESUME_UNSUPPORTED_DOCUMENT");
  error.code = "RESUME_UNSUPPORTED_DOCUMENT";
  error.statusCode = 415;
  throw error;
}

async function extractText({ buffer, mimetype, originalname }) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("Resume buffer must be a Buffer.");
  }

  const type = detectFileType({ mimetype, originalname });

  if (type === "PDF") {
    return extractPdfText(buffer);
  }

  return extractDocxText(buffer);
}

function parseCandidateData(text) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    const error = new Error("RESUME_PARSE_FAILED");
    error.code = "RESUME_PARSE_FAILED";
    throw error;
  }

  const email = extractEmail(normalizedText);
  const phone = extractPhone(normalizedText);
  const name = extractName(normalizedText, email);
  const skills = extractSkills(normalizedText);
  const totalExperienceYears = extractExperienceYears(normalizedText);

  return {
    name,
    email,
    phone,
    skills,
    totalExperienceYears,
  };
}

function calculateFileHash(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new TypeError("Resume buffer must be a Buffer.");
  }

  return crypto
    .createHash("sha256")
    .update(buffer)
    .digest("hex");
}

async function parseResume({ buffer, mimetype, originalname }) {
  const fileHash = calculateFileHash(buffer);
  const text = await extractText({ buffer, mimetype, originalname });
  const candidate = parseCandidateData(text);

  return {
    fileHash,
    text,
    candidate,
  };
}

module.exports = {
  normalizeText,
  normalizeEmail,
  normalizePhone,
  extractEmail,
  extractPhone,
  extractName,
  extractSkills,
  extractExperienceYears,
  extractPdfText,
  extractDocxText,
  detectFileType,
  extractText,
  parseCandidateData,
  calculateFileHash,
  parseResume,
};
