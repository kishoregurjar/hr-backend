"use strict";

const MAX_RESUME_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_RESUME_SIZE_BYTES = MAX_RESUME_SIZE;
const MAX_RESUME_FILE_SIZE = MAX_RESUME_SIZE;
const PARSER_VERSION = "1.0.0";

const ALLOWED_RESUME_EXTENSIONS = Object.freeze([
  ".pdf",
  ".docx",
  ".doc",
]);

const ALLOWED_RESUME_MIME_TYPES = Object.freeze([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
]);

const RESUME_FILE_FIELD_NAME = "resume";

const RESUME_FILE_TYPES = Object.freeze({
  PDF: "PDF",
  DOCX: "DOCX",
  DOC: "DOC",
});

const RESUME_PROCESSING_SOURCE = Object.freeze({
  DIRECT_UPLOAD: "DIRECT_UPLOAD",
  INBOUND_EMAIL: "INBOUND_EMAIL",
});

const INBOUND_EMAIL_PROVIDERS = Object.freeze({
  SENDGRID: "sendgrid",
  MAILGUN: "mailgun",
  SES: "ses",
});

const MAX_INBOUND_ATTACHMENTS = 5;

const MAX_INBOUND_EMAIL_SIZE = 15 * 1024 * 1024;

const INBOUND_SIGNATURE_MAX_AGE_SECONDS = 10 * 60;

const RESUME_ERROR_CODES = Object.freeze({
  FILE_REQUIRED: "RESUME_FILE_REQUIRED",
  FILE_EMPTY: "RESUME_FILE_EMPTY",
  FILE_TOO_LARGE: "RESUME_FILE_TOO_LARGE",
  UNSUPPORTED_FILE_TYPE: "UNSUPPORTED_FILE_TYPE",
  INVALID_FILE_SIGNATURE: "INVALID_FILE_SIGNATURE",
  CANDIDATE_EMAIL_NOT_FOUND: "CANDIDATE_EMAIL_NOT_FOUND",
  CANDIDATE_EMAIL_CONFLICT: "CANDIDATE_EMAIL_CONFLICT",
  JOB_NOT_FOUND: "JOB_NOT_FOUND",
  JOB_APPLICATION_ALREADY_EXISTS: "JOB_APPLICATION_ALREADY_EXISTS",
  RESUME_STORAGE_UNAVAILABLE: "RESUME_STORAGE_UNAVAILABLE",
  RESUME_PROCESSING_FAILED: "RESUME_PROCESSING_FAILED",
  RESUME_REVIEW_REQUIRED: "RESUME_REVIEW_REQUIRED",
  NOT_A_TECH_RESUME: "NOT_A_TECH_RESUME",
  NOT_A_RESUME: "NOT_A_RESUME",
  AMBIGUOUS_TECH_PROFILE: "AMBIGUOUS_TECH_PROFILE",

  INVALID_FILE: "RESUME_INVALID_FILE",
  INVALID_MAGIC_BYTES: "RESUME_INVALID_MAGIC_BYTES",
  DUPLICATE_FILE: "RESUME_DUPLICATE_FILE",
  PARSE_FAILED: "RESUME_PARSE_FAILED",
  REVIEW_REQUIRED: "RESUME_REVIEW_REQUIRED",
  CANDIDATE_NOT_FOUND: "CANDIDATE_NOT_FOUND",
  CANDIDATE_CONFLICT: "CANDIDATE_CONFLICT",
  JOB_NOT_ACTIVE: "JOB_NOT_ACTIVE",
  APPLICATION_EXISTS: "APPLICATION_EXISTS",
  STORAGE_FAILED: "RESUME_STORAGE_FAILED",

  INBOUND_INVALID_PROVIDER: "INBOUND_INVALID_PROVIDER",
  INBOUND_SIGNATURE_INVALID: "INBOUND_SIGNATURE_INVALID",
  INBOUND_SIGNATURE_EXPIRED: "INBOUND_SIGNATURE_EXPIRED",
  INBOUND_MESSAGE_ID_REQUIRED: "INBOUND_MESSAGE_ID_REQUIRED",
  INBOUND_PAYLOAD_INVALID: "INBOUND_PAYLOAD_INVALID",
  INBOUND_ATTACHMENT_LIMIT: "INBOUND_ATTACHMENT_LIMIT",
  INBOUND_ATTACHMENT_TOO_LARGE: "INBOUND_ATTACHMENT_TOO_LARGE",
  INBOUND_ATTACHMENT_TYPE: "INBOUND_ATTACHMENT_TYPE",
  INBOUND_EVENT_PROCESSING: "INBOUND_EVENT_PROCESSING",
  INBOUND_EVENT_FAILED: "INBOUND_EVENT_FAILED",
});

const RESUME_UPLOAD_LIMITS = Object.freeze({
  files: 1,
  fileSize: MAX_RESUME_FILE_SIZE,
});

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

  DOC: Object.freeze({
    mimeType: "application/msword",
    extensions: Object.freeze([".doc"]),
  }),
});

const ALLOWED_MIME_TYPES = ALLOWED_RESUME_MIME_TYPES;
const ALLOWED_EXTENSIONS = ALLOWED_RESUME_EXTENSIONS;

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

const ERROR_CODES = RESUME_ERROR_CODES;

const REGEX = Object.freeze({
  EMAIL: /[a-zA-Z0-9._%+-]+\s*@\s*[a-zA-Z0-9.-]+\s*\.\s*[a-zA-Z]{2,}/gi,
  PHONE: /(?:\+?\d{1,3}[\s.-]*)?(?:\(?\d{2,4}\)?[\s.-]*)?\d{3,5}[\s.-]*\d{4,5}\b/g,
  YEARS_EXPERIENCE: /(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s*(?:professional\s+)?experience/gi,
  EXPERIENCE_SECTION: /\b(?:professional\s+experience|work\s+experience|experience|employment\s+history)\b/i,
  SKILLS_SECTION: /\b(?:technical\s+skills|skills|technologies|tech\s+stack|technical\s+expertise)\b/i,
});

const SKILL_DICTIONARY = Object.freeze([
  // Languages & Core
  "Node.js", "Node",
  "Express.js", "Express",
  "TypeScript", "TS",
  "JavaScript", "JS",
  "React", "React.js",
  "Next.js",
  "Angular",
  "Vue.js", "Vue",
  "Svelte",
  "Python",
  "Java",
  "C++",
  "C#",
  "C",
  "Go", "Golang",
  "Rust",
  "PHP",
  "Laravel",
  "Ruby", "Rails", "Ruby on Rails",
  "Kotlin",
  "Swift",
  "Dart",
  "Flutter",
  "Scala",
  "R",
  "Solidity",
  "Shell", "Bash",

  // Databases, Caching & ORM
  "PostgreSQL", "Postgres",
  "MySQL",
  "MSSQL", "SQL Server",
  "MongoDB", "Mongoose",
  "Redis",
  "SQL",
  "SQLite",
  "DynamoDB",
  "Cassandra",
  "Elasticsearch",
  "Supabase",
  "Prisma",
  "Sequelize",
  "TypeORM",

  // Cloud, Infrastructure & DevOps
  "Docker",
  "Kubernetes", "K8s",
  "AWS",
  "Azure",
  "GCP", "Google Cloud",
  "Git",
  "GitHub",
  "GitLab",
  "Terraform",
  "Ansible",
  "CI/CD",
  "Jenkins",
  "GitHub Actions",
  "GitLab CI",
  "Linux", "Ubuntu",
  "Nginx", "Apache",
  "Helm",
  "Prometheus", "Grafana",

  // Architecture & APIs
  "REST", "REST APIs", "REST API",
  "GraphQL",
  "gRPC",
  "Kafka",
  "RabbitMQ",
  "Microservices",
  "WebSockets",

  // Frontend & UI
  "HTML", "HTML5",
  "CSS", "CSS3",
  "Tailwind CSS", "Tailwind",
  "Bootstrap",
  "SASS", "SCSS",
  "Redux", "Redux Toolkit",
  "Webpack", "Vite",
  "EJS",

  // Mobile
  "React Native",
  "Android", "Android SDK", "Jetpack Compose",
  "iOS", "SwiftUI",

  // Testing & QA
  "Jest",
  "Mocha",
  "Chai",
  "Playwright",
  "Cypress",
  "Selenium",
  "JUnit",
  "TestNG",
  "PyTest",
  "Postman",
  "Cucumber",
  "Appium",
  "JMeter",

  // Data, AI & ML
  "Machine Learning", "Deep Learning",
  "PyTorch", "TensorFlow", "Keras",
  "Scikit-learn",
  "Pandas", "NumPy",
  "Spark", "Hadoop",
  "Airflow",
  "Snowflake", "Databricks", "BigQuery",
  "Data Science", "Data Engineering",
  "Computer Vision", "NLP",

  // Backend Frameworks & Ecosystem
  ".NET", "ASP.NET", ".NET Core",
  "Spring", "Spring Boot",
  "Django", "Flask", "FastAPI",
  "Nest.js", "NestJS",
  "Firebase",
]);

const TECH_ROLES_REGEX =
  /\b(software\s+(?:engineer|developer|architect)|full\s*stack\s+(?:developer|engineer)|frontend\s+(?:developer|engineer)|backend\s+(?:developer|engineer)|web\s+developer|devops\s+engineer|cloud\s+(?:engineer|architect)|qa\s+(?:engineer|tester|analyst)|sdet|automation\s+engineer|test\s+engineer|data\s+(?:engineer|scientist|analyst)|ml\s+engineer|ai\s+engineer|machine\s+learning\s+engineer|mobile\s+developer|android\s+developer|ios\s+developer|system\s+administrator|sysadmin|solutions\s+architect|database\s+administrator|dba|technical\s+lead|tech\s+lead|engineering\s+manager|cto|site\s+reliability\s+engineer|sre|security\s+engineer|cybersecurity|network\s+engineer|embedded\s+engineer|firmware\s+engineer|computer\s+programmer|programmer)\b/i;

const TECH_EDUCATION_REGEX =
  /\b(computer\s+science|information\s+technology|software\s+engineering|computer\s+engineering|data\s+science|b\.?\s*tech|b\.?\s*e\.?|bca|mca|m\.?\s*tech|bs\s+cs|ms\s+cs|b\.?\s*sc\s+(?:cs|it|computer)|m\.?\s*sc\s+(?:cs|it|computer))\b/i;

const TECH_LINKS_REGEX =
  /(?:github\.com|gitlab\.com|bitbucket\.org|leetcode\.com|hackerrank\.com|codeforces\.com|kaggle\.com|stackoverflow\.com)\/[a-zA-Z0-9_.-]+/i;

const NON_TECH_ROLES_REGEX =
  /\b(sales\s+(?:executive|manager|associate|representative)|business\s+development\s+(?:executive|manager)|real\s+estate\s+agent|broker|registered\s+nurse|staff\s+nurse|physician|medical\s+doctor|dentist|pharmacist|physical\s+therapist|chef|head\s+cook|bartender|barista|waiter|waitress|restaurant\s+server|elementary\s+teacher|primary\s+teacher|kindergarten\s+teacher|school\s+teacher|human\s+resources\s+(?:executive|manager|generalist|recruiter)|hr\s+(?:recruiter|generalist|executive)|talent\s+acquisition|legal\s+counsel|attorney|lawyer|paralegal|chartered\s+accountant|bookkeeper|auditor|financial\s+analyst|investment\s+banker|insurance\s+agent|underwriter|customer\s+service\s+(?:representative|agent)|call\s+center\s+agent|store\s+(?:cashier|clerk|manager)|retail\s+sales\s+associate|warehouse\s+(?:worker|supervisor)|logistics\s+coordinator)\b/i;

const JD_BROADCAST_REGEX =
  /\b(we\s+are\s+hiring|job\s+description|about\s+the\s+role|role\s+overview|who\s+we\s+are\s+looking\s+for|what\s+you'll\s+do|key\s+responsibilities|responsibilities\s*&?\s*requirements|what\s+we\s+offer|benefits\s*&?\s*perks|how\s+to\s+apply|equal\s+opportunity\s+employer|about\s+our\s+company|about\s+the\s+company)\b/gi;

const CANDIDATE_STRUCTURE_REGEX =
  /\b(education|academic|work\s+experience|professional\s+experience|employment\s+history|personal\s+projects|academic\s+projects|certifications?|curriculum\s+vitae|resume)\b/i;

module.exports = {
  MAX_RESUME_SIZE,
  MAX_RESUME_SIZE_BYTES,
  MAX_RESUME_FILE_SIZE,
  ALLOWED_RESUME_EXTENSIONS,
  ALLOWED_RESUME_MIME_TYPES,
  RESUME_FILE_FIELD_NAME,
  PARSER_VERSION,
  RESUME_FILE_TYPES,
  RESUME_PROCESSING_SOURCE,
  INBOUND_EMAIL_PROVIDERS,
  MAX_INBOUND_ATTACHMENTS,
  MAX_INBOUND_EMAIL_SIZE,
  INBOUND_SIGNATURE_MAX_AGE_SECONDS,
  RESUME_ERROR_CODES,
  RESUME_UPLOAD_LIMITS,
  SUPPORTED_RESUME_TYPES,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  RESUME_STATUS,
  RESUME_SOURCE,
  ERROR_CODES,
  REGEX,
  SKILL_DICTIONARY,
  TECH_ROLES_REGEX,
  TECH_EDUCATION_REGEX,
  TECH_LINKS_REGEX,
  NON_TECH_ROLES_REGEX,
  JD_BROADCAST_REGEX,
  CANDIDATE_STRUCTURE_REGEX,
};
