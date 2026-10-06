"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { assertSuperAdmin } = require("../../src/modules/super-admin/super-admin.authorization");
const { getAnalyticsSchema } = require("../../src/modules/super-admin/super-admin.analytics.validator");
const analyticsService = require("../../src/modules/super-admin/super-admin.analytics.service");

test("Super Admin Analytics - Authorization Rules", () => {
  // 1. SUPER_ADMIN user passes authorization
  assert.doesNotThrow(() => {
    assertSuperAdmin({ id: "admin-1", role: "SUPER_ADMIN" });
  });

  // 2. HR role receives 403 SUPER_ADMIN_ACCESS_DENIED
  assert.throws(
    () => {
      assertSuperAdmin({ id: "user-1", role: "HR" });
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, "SUPER_ADMIN_ACCESS_DENIED");
      return true;
    }
  );

  // 3. CANDIDATE role receives 403 SUPER_ADMIN_ACCESS_DENIED
  assert.throws(
    () => {
      assertSuperAdmin({ id: "user-2", role: "CANDIDATE" });
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, "SUPER_ADMIN_ACCESS_DENIED");
      return true;
    }
  );

  // 4. Null or unauthenticated user receives 403 SUPER_ADMIN_ACCESS_DENIED
  assert.throws(
    () => {
      assertSuperAdmin(null);
    },
    (err) => {
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, "SUPER_ADMIN_ACCESS_DENIED");
      return true;
    }
  );
});

test("Super Admin Analytics - Query Parameter Validation", async () => {
  assert.equal(getAnalyticsSchema.safeParse({ preset: "7d" }).success, true);
  assert.equal(getAnalyticsSchema.safeParse({ preset: "30d" }).success, true);
  assert.equal(getAnalyticsSchema.safeParse({ preset: "90d" }).success, true);
  assert.equal(getAnalyticsSchema.safeParse({ preset: "all" }).success, true);
  assert.equal(getAnalyticsSchema.safeParse({}).success, true);

  const invalidPreset = getAnalyticsSchema.safeParse({ preset: "invalid_preset" });
  assert.equal(invalidPreset.success, false);

  const validCustom = getAnalyticsSchema.safeParse({
    preset: "custom",
    dateFrom: "2026-10-01",
    dateTo: "2026-10-06",
  });
  assert.equal(validCustom.success, true);

  const missingFrom = getAnalyticsSchema.safeParse({ preset: "custom", dateTo: "2026-10-06" });
  assert.equal(missingFrom.success, false);

  const missingTo = getAnalyticsSchema.safeParse({ preset: "custom", dateFrom: "2026-10-01" });
  assert.equal(missingTo.success, false);

  const invalidFrom = getAnalyticsSchema.safeParse({ preset: "custom", dateFrom: "not-a-date", dateTo: "2026-10-06" });
  assert.equal(invalidFrom.success, false);

  const invalidTo = getAnalyticsSchema.safeParse({ preset: "custom", dateFrom: "2026-10-01", dateTo: "invalid" });
  assert.equal(invalidTo.success, false);

  const reversedDates = getAnalyticsSchema.safeParse({
    preset: "custom",
    dateFrom: "2026-10-10",
    dateTo: "2026-10-01",
  });
  assert.equal(reversedDates.success, false);
});

test("Super Admin Analytics - Trends Payload & Zero-Filling", async () => {
  const result = await analyticsService.getPlatformAnalytics({ preset: "7d" });

  assert.ok(result);
  assert.ok(result.summary);
  assert.ok(result.dateRange);
  assert.ok(result.trends);

  // Check trends series arrays
  assert.ok(Array.isArray(result.trends.candidateActivity));
  assert.ok(Array.isArray(result.trends.testCompletion));
  assert.ok(Array.isArray(result.trends.averageScore));
  assert.ok(Array.isArray(result.trends.completionRate));

  // 7d preset should generate at least 7-8 zero-filled date points
  assert.ok(result.trends.candidateActivity.length >= 7);
  assert.equal(result.trends.candidateActivity.length, result.trends.testCompletion.length);
  assert.equal(result.trends.candidateActivity.length, result.trends.averageScore.length);

  // Verify structure of first trend item
  const item = result.trends.candidateActivity[0];
  assert.ok(item.date);
  assert.equal(typeof item.started, "number");
  assert.equal(typeof item.completed, "number");

  const scoreItem = result.trends.averageScore[0];
  assert.ok(scoreItem.date);
  assert.equal(typeof scoreItem.averageScore, "number");
  assert.ok(scoreItem.averageScore >= 0 && scoreItem.averageScore <= 100);

  const compRateItem = result.trends.completionRate[0];
  assert.ok(compRateItem.date);
  assert.equal(typeof compRateItem.completionRate, "number");
  assert.ok(compRateItem.completionRate >= 0 && compRateItem.completionRate <= 100);
});

test("Super Admin Analytics - CSV Formatting & Sections", async () => {
  const analyticsData = await analyticsService.getPlatformAnalytics({ preset: "30d" });
  const csv = analyticsService.generateAnalyticsCsv(analyticsData);

  assert.ok(typeof csv === "string");
  assert.ok(csv.length > 0);

  // Verify required CSV sections
  assert.ok(csv.includes("Metric,Value"), "CSV missing Metric,Value header");
  assert.ok(csv.includes("Report,Platform Analytics"), "CSV missing Report title");
  assert.ok(csv.includes("Timezone,UTC"), "CSV missing UTC timezone");

  assert.ok(csv.includes("Summary"), "CSV missing Summary section");
  assert.ok(csv.includes("Total Companies,"), "CSV missing Total Companies");
  assert.ok(csv.includes("Active Jobs,"), "CSV missing Active Jobs");
  assert.ok(csv.includes("Assessed Candidates,"), "CSV missing Assessed Candidates");
  assert.ok(csv.includes("Tests Completed,"), "CSV missing Tests Completed");
  assert.ok(csv.includes("Average Completion Rate,"), "CSV missing Average Completion Rate");
  assert.ok(csv.includes("Average Candidate Score,"), "CSV missing Average Candidate Score");

  assert.ok(csv.includes("Candidate Activity"), "CSV missing Candidate Activity section");
  assert.ok(csv.includes("Date,Started,Completed"), "CSV missing Candidate Activity headers");

  assert.ok(csv.includes("Test Completion"), "CSV missing Test Completion section");
  assert.ok(csv.includes("Date,Started,Submitted"), "CSV missing Test Completion headers");

  assert.ok(csv.includes("Average Score"), "CSV missing Average Score section");
  assert.ok(csv.includes("Date,Average Score"), "CSV missing Average Score headers");

  assert.ok(csv.includes("Completion Rate"), "CSV missing Completion Rate section");
  assert.ok(csv.includes("Date,Completion Rate"), "CSV missing Completion Rate headers");

  assert.ok(csv.includes("Game Usage"), "CSV missing Game Usage section");
  assert.ok(
    csv.includes("Game,Code,Category,Assessments Used,Average Play Time,Active"),
    "CSV missing Game Usage headers"
  );
});

test("Super Admin Analytics - PDF Document Generation", async () => {
  const analyticsData = await analyticsService.getPlatformAnalytics({ preset: "7d" });
  const pdfBuffer = await analyticsService.generateAnalyticsPdf(analyticsData);

  assert.ok(Buffer.isBuffer(pdfBuffer), "PDF output must be a Buffer");
  assert.ok(pdfBuffer.length > 0, "PDF buffer must be non-zero size");

  // Verify PDF binary header (%PDF-)
  const headerStr = pdfBuffer.toString("utf8", 0, 5);
  assert.equal(headerStr, "%PDF-");
});

test("Super Admin Analytics - Deterministic Filename Generator", () => {
  assert.equal(
    analyticsService.generateExportFilename({ preset: "30d" }, "csv"),
    "hirequest-platform-analytics-30d.csv"
  );

  assert.equal(
    analyticsService.generateExportFilename({ preset: "7d" }, "pdf"),
    "hirequest-platform-analytics-7d.pdf"
  );

  assert.equal(
    analyticsService.generateExportFilename({ preset: "all" }, "csv"),
    "hirequest-platform-analytics-all.csv"
  );

  assert.equal(
    analyticsService.generateExportFilename(
      { preset: "custom", dateFrom: "2026-10-01T00:00:00.000Z", dateTo: "2026-10-06T23:59:59.999Z" },
      "csv"
    ),
    "hirequest-platform-analytics-2026-10-01-to-2026-10-06.csv"
  );

  assert.equal(
    analyticsService.generateExportFilename(
      { preset: "custom", dateFrom: "2026-10-01T00:00:00.000Z", dateTo: "2026-10-06T23:59:59.999Z" },
      "pdf"
    ),
    "hirequest-platform-analytics-2026-10-01-to-2026-10-06.pdf"
  );
});

test("Super Admin Analytics - Export Controller Endpoints & Headers", async () => {
  const controller = require("../../src/modules/super-admin/super-admin.analytics.controller");
  const { prisma } = require("../../src/config/prisma");

  const superAdmin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
  });

  const actorUserId = superAdmin ? superAdmin.id : null;

  // Mock Request & Response for CSV Export
  const csvHeaders = {};
  let csvStatus = 0;
  let csvSentData = null;

  const mockCsvReq = {
    validatedData: { preset: "30d" },
    user: { id: actorUserId, role: "SUPER_ADMIN" },
  };

  const mockCsvRes = {
    setHeader: (key, val) => {
      csvHeaders[key] = val;
    },
    status: (code) => {
      csvStatus = code;
      return mockCsvRes;
    },
    send: (data) => {
      csvSentData = data;
      return mockCsvRes;
    },
  };

  await controller.exportCsv(mockCsvReq, mockCsvRes, (err) => {
    if (err) throw err;
  });

  assert.equal(csvStatus, 200);
  assert.equal(csvHeaders["Content-Type"], "text/csv; charset=utf-8");
  assert.equal(
    csvHeaders["Content-Disposition"],
    'attachment; filename="hirequest-platform-analytics-30d.csv"'
  );
  assert.ok(typeof csvSentData === "string");
  assert.ok(csvSentData.includes("Report,Platform Analytics"));

  // Mock Request & Response for PDF Export
  const pdfHeaders = {};
  let pdfStatus = 0;
  let pdfSentData = null;

  const mockPdfReq = {
    validatedData: { preset: "7d" },
    user: { id: actorUserId, role: "SUPER_ADMIN" },
  };

  const mockPdfRes = {
    setHeader: (key, val) => {
      pdfHeaders[key] = val;
    },
    status: (code) => {
      pdfStatus = code;
      return mockPdfRes;
    },
    send: (data) => {
      pdfSentData = data;
      return mockPdfRes;
    },
  };

  await controller.exportPdf(mockPdfReq, mockPdfRes, (err) => {
    if (err) throw err;
  });

  assert.equal(pdfStatus, 200);
  assert.equal(pdfHeaders["Content-Type"], "application/pdf");
  assert.equal(
    pdfHeaders["Content-Disposition"],
    'attachment; filename="hirequest-platform-analytics-7d.pdf"'
  );
  assert.ok(Buffer.isBuffer(pdfSentData));
  assert.ok(pdfSentData.length > 0);
});


