"use strict";

const MAX_RESUME_SIZE_BYTES = 5 * 1024 * 1024;

const SUPPORTED_RESUME_TYPES = Object.freeze({
  PDF: Object.freeze({
    mimeType: "application/pdf",
    extensions: Object.freeze([".pdf"]),
  }),

  DOCX: Object.freeze({
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: Object.freeze([".docx"]),
  }),
});

const ALLOWED_MIME_TYPES = Object.freeze(
  Object.values(SUPPORTED_RESUME_TYPES).map((item) => item.mimeType)
);

const ALLOWED_EXTENSIONS = Object.freeze(
  Object.values(SUPPORTED_RESUME_TYPES).flatMap((item) => item.extensions)
);

const RESUME_STATUS = Object.freeze({
  RECEIVED: "RECEIVED",
  PROCESSING: "PROCESSING",
  PARSED: "PARSED",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

const RESUME_SOURCE = Object.freeze({
  UPLOAD: "UPLOAD",
  INBOUND_EMAIL: "INBOUND_EMAIL",
});

const ERROR_CODES = Object.freeze({
  RESUME_FILE_REQUIRED: "RESUME_FILE_REQUIRED",
  RESUME_FILE_TOO_LARGE: "RESUME_FILE_TOO_LARGE",
  RESUME_FILE_TYPE_NOT_ALLOWED: "RESUME_FILE_TYPE_NOT_ALLOWED",
  RESUME_FILE_EXTENSION_NOT_ALLOWED: "RESUME_FILE_EXTENSION_NOT_ALLOWED",
  RESUME_FILE_EMPTY: "RESUME_FILE_EMPTY",
  RESUME_FILE_CORRUPTED: "RESUME_FILE_CORRUPTED",
  RESUME_TEXT_EXTRACTION_FAILED: "RESUME_TEXT_EXTRACTION_FAILED",
  RESUME_UNSUPPORTED_DOCUMENT: "RESUME_UNSUPPORTED_DOCUMENT",
  RESUME_PARSE_FAILED: "RESUME_PARSE_FAILED",
  RESUME_EMAIL_PAYLOAD_INVALID: "RESUME_EMAIL_PAYLOAD_INVALID",
  RESUME_EMAIL_SIGNATURE_INVALID: "RESUME_EMAIL_SIGNATURE_INVALID",
  RESUME_DUPLICATE: "RESUME_DUPLICATE",
  RESUME_NOT_FOUND: "RESUME_NOT_FOUND",
  RESUME_PROCESSING_FAILED: "RESUME_PROCESSING_FAILED",
});

const REGEX = Object.freeze({
  EMAIL: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  PHONE: /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{4}\b/g,
  YEARS_EXPERIENCE: /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s*(?:professional\s+)?experience/gi,
  EXPERIENCE_SECTION: /\b(?:professional\s+experience|work\s+experience|experience|employment\s+history)\b/i,
  SKILLS_SECTION: /\b(?:technical\s+skills|skills|technologies|tech\s+stack|technical\s+expertise)\b/i,
});

const SKILL_DICTIONARY = Object.freeze([
  "Node.js",
  "Express.js",
  "TypeScript",
  "JavaScript",
  "React",
  "React.js",
  "Next.js",
  "Angular",
  "Vue.js",
  "Python",
  "Java",
  "C++",
  "C#",
  "Go",
  "Rust",
  "PHP",
  "Laravel",
  "PostgreSQL",
  "MySQL",
  "MongoDB",
  "Redis",
  "SQL",
  "Prisma",
  "Sequelize",
  "Mongoose",
  "Docker",
  "Kubernetes",
  "AWS",
  "Azure",
  "GCP",
  "Git",
  "GitHub",
  "GitLab",
  "REST",
  "REST API",
  "GraphQL",
  "Kafka",
  "RabbitMQ",
  "HTML",
  "CSS",
  "Tailwind CSS",
  "Jest",
  "Mocha",
  "Playwright",
]);

module.exports = {
  MAX_RESUME_SIZE_BYTES,
  SUPPORTED_RESUME_TYPES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  RESUME_STATUS,
  RESUME_SOURCE,
  ERROR_CODES,
  REGEX,
  SKILL_DICTIONARY,
};
