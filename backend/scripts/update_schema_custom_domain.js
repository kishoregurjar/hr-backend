"use strict";

const fs = require("fs");
const path = require("path");

const schemaPath = path.join(__dirname, "../prisma/schema.prisma");
let content = fs.readFileSync(schemaPath, "utf8");

// 1. Remove duplicate branding and customDomain fields from Job
const jobPattern = /(model Job \{[\s\S]*?description String\?)\r?\n\s*\/\/ White-Label Branding Extensions[\s\S]*?customDomainVerified\s+Boolean\s+@default\(false\)\r?\n/g;
if (jobPattern.test(content)) {
  content = content.replace(jobPattern, "$1\n");
  console.log("Cleaned up Job model");
}

// 2. Add customDomain to Company model
const companyPattern = /(model Company \{[\s\S]*?showPoweredByHireQuest Boolean @default\(true\))/;
if (companyPattern.test(content) && !content.includes("customDomain           String?  @unique\n  customDomainVerified   Boolean  @default(false)\n\n  createdAt")) {
  content = content.replace(
    companyPattern,
    `$1\n\n  // Phase 3C Custom Domain Extensions\n  customDomain           String?  @unique\n  customDomainVerified   Boolean  @default(false)`
  );
  console.log("Added customDomain fields specifically to Company model");
}

fs.writeFileSync(schemaPath, content, "utf8");
console.log("Updated schema.prisma successfully.");
