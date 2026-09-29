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

let WordExtractor;
try {
  WordExtractor = require("word-extractor");
} catch (_) {
  WordExtractor = null;
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
  return email ? email.replace(/\s+/g, "").toLowerCase() : null;
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
  const topLines = text.split("\n").slice(0, 30).join("\n");
  let matches = topLines.match(REGEX.EMAIL);
  if (!matches?.length) {
    matches = text.match(REGEX.EMAIL);
  }
  
  if (!matches?.length) {
    return [];
  }

  return Array.from(new Set(matches.map(normalizeEmail).filter(Boolean)));
}

function extractPhone(text) {
  const topLines = text.split("\n").slice(0, 30).join("\n");
  let matches = topLines.match(REGEX.PHONE);
  if (!matches?.length) {
    matches = text.match(REGEX.PHONE);
  }
  
  if (!matches?.length) {
    return [];
  }

  const validPhones = new Set();
  for (const candidate of matches) {
    const phone = normalizePhone(candidate);
    if (phone) {
      const raw = candidate.trim();
      const hasCountryCode = raw.startsWith("+") || raw.startsWith("00");
      const hasFormatting = /[\s.()-]/.test(raw);
      const isIndianLocal = /^[6789]\d{9}$/.test(phone);
      const isUSLocal = /^1?[2-9]\d{9}$/.test(phone);

      if (hasCountryCode || hasFormatting || isIndianLocal || isUSLocal) {
        if (!hasFormatting && !hasCountryCode && phone.length === 10) {
          if (isUSLocal || isIndianLocal) {
            validPhones.add(phone);
          }
        } else {
          validPhones.add(phone);
        }
      }
    }
  }

  return Array.from(validPhones);
}

function extractName(text, email) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

  const emailRegex = new RegExp(REGEX.EMAIL.source, "i");
  const phoneRegex = new RegExp(REGEX.PHONE.source, "i");

  for (const line of lines) {
    if (line.length < 2 || line.length > 50) continue;
    if (emailRegex.test(line) || phoneRegex.test(line)) continue;
    if (/^(resume|cv|curriculum vitae|page \d)$/i.test(line)) continue;
    if (/^(summary|profile|objective|experience|skills|education|contact|about|portfolio)$/i.test(line)) continue;
    if (email && line.toLowerCase().includes(email.toLowerCase())) continue;
    if (/\b(developer|engineer|manager|director|consultant|designer|student|university|college|inc|llc|ltd|pvt)\b/i.test(line)) continue;

    const words = line.split(/\s+/);
    if (
      words.length >= 2 &&
      words.length <= 5 &&
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
  
  const commonWords = ["Go", "C", "R", "Rust", "Java", "Ruby", "Objective-C", "REST", "Git"];

  for (const skill of SKILL_DICTIONARY) {
    const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const isCommonWord = commonWords.includes(skill);

    const isPunctuationStart = /^[^\w]/.test(skill);
    const isPunctuationEnding = /[^\w]$/.test(skill);
    const startBoundary = isPunctuationStart ? "(^|\\s|[\\(\\[\\{])" : "\\b";
    const endBoundary = isPunctuationEnding ? "(?=$|\\s|[.,;\\)\\]\\}])" : "\\b";

    let regex;
    if (isCommonWord) {
      regex = new RegExp(`${startBoundary}${escapedSkill}${endBoundary}`);
    } else {
      regex = new RegExp(`${startBoundary}${escapedSkill}${endBoundary}`, "i");
    }

    if (regex.test(isCommonWord ? text : normalizedText)) {
      found.set(skill.toLowerCase(), skill);
    }
  }

  const aliasMap = {
    "node": "Node.js", "node.js": "Node.js",
    "react": "React.js", "react.js": "React.js",
    "javascript": "JavaScript", "js": "JavaScript",
    "express": "Express.js", "express.js": "Express.js",
    "vue": "Vue.js", "vue.js": "Vue.js",
    "rest": "REST APIs", "rest api": "REST APIs", "rest apis": "REST APIs",
    "html": "HTML5", "html5": "HTML5",
    "css": "CSS3", "css3": "CSS3",
    "tailwind": "Tailwind CSS", "tailwind css": "Tailwind CSS",
    "redux": "Redux Toolkit", "redux toolkit": "Redux Toolkit",
    "golang": "Go", "go": "Go",
  };

  const finalSkills = new Set();
  for (const skill of found.values()) {
    const lower = skill.toLowerCase();
    finalSkills.add(aliasMap[lower] || skill);
  }

  return [...finalSkills].sort((a, b) => a.localeCompare(b));
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
    let text = normalizeText(result.text);

    // OCR Fallback: If text is missing or demonstrably insufficient (e.g. image-based PDF)
    if (!text || text.length < 50) {
      // In a real environment with Ghostscript installed, we would use pdf2pic and tesseract.js here.
      // Example:
      // const images = await convertPdfToImages(buffer);
      // text = await performOcrOnImages(images);
      
      // For now, if we still have no text, we throw to let the caller handle it.
      if (!text) {
        throw new Error("PDF_TEXT_EMPTY");
      }
    }

    return text;
  } catch (error) {
    console.error("[DIAGNOSTIC] extractPdfText failed:", error);
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

async function extractDocText(buffer) {
  try {
    if (!WordExtractor) {
      return normalizeText(buffer.toString("utf-8"));
    }

    const extractor = new WordExtractor();
    const result = await extractor.extract(buffer);
    const text = normalizeText(result.getBody());

    if (!text) {
      throw new Error("DOC_TEXT_EMPTY");
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

  if (extension === ".pdf") {
    return "PDF";
  }

  if (extension === ".docx") {
    return "DOCX";
  }

  if (extension === ".doc") {
    return "DOC";
  }

  if (mimetype === SUPPORTED_RESUME_TYPES.PDF.mimeType) {
    return "PDF";
  }

  if (mimetype === SUPPORTED_RESUME_TYPES.DOCX.mimeType) {
    return "DOCX";
  }

  if (mimetype === SUPPORTED_RESUME_TYPES.DOC.mimeType) {
    return "DOC";
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

  if (type === "DOCX") {
    return extractDocxText(buffer);
  }

  return extractDocText(buffer);
}

function parseCandidateData(text) {
  const normalizedText = normalizeText(text);

  if (!normalizedText) {
    const error = new Error("RESUME_PARSE_FAILED");
    error.code = "RESUME_PARSE_FAILED";
    throw error;
  }

  const emails = extractEmail(normalizedText);
  const phones = extractPhone(normalizedText);
  
  const email = emails.length > 0 ? emails[0] : null;
  const phone = phones.length > 0 ? phones[0] : null;
  
  const name = extractName(normalizedText, email);
  const skills = extractSkills(normalizedText);
  const totalExperienceYears = extractExperienceYears(normalizedText);

  const isAmbiguous = emails.length > 1 || phones.length > 1 || !name;

  return {
    name,
    email,
    phone,
    skills,
    totalExperienceYears,
    _rawEmails: emails,
    _rawPhones: phones,
    _isAmbiguous: isAmbiguous
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

  let status = "PARSED";
  let errorCode = null;

  if (candidate._isAmbiguous) {
    status = "REVIEW_REQUIRED";
    if (!candidate.name) errorCode = "NAME_EXTRACTION_FAILED";
    else if (candidate._rawEmails.length > 1) errorCode = "MULTIPLE_EMAILS_FOUND";
    else if (candidate._rawPhones.length > 1) errorCode = "MULTIPLE_PHONES_FOUND";
  }

  // Remove internal properties
  delete candidate._rawEmails;
  delete candidate._rawPhones;
  delete candidate._isAmbiguous;

  return {
    fileHash,
    text,
    candidate,
    status,
    errorCode
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
