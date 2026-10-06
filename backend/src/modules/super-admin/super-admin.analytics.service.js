"use strict";

const analyticsRepository = require("./super-admin.analytics.repository");

/**
 * Helper to generate an array of YYYY-MM-DD date strings between start and end date (inclusive)
 */
const generateDateSeries = (startDate, endDate) => {
  if (!startDate || !endDate) return [];

  const dateList = [];
  const curr = new Date(startDate);
  const end = new Date(endDate);

  curr.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(0, 0, 0, 0);

  while (curr <= end) {
    const year = curr.getUTCFullYear();
    const month = String(curr.getUTCMonth() + 1).padStart(2, "0");
    const day = String(curr.getUTCDate()).padStart(2, "0");
    dateList.push(`${year}-${month}-${day}`);
    curr.setUTCDate(curr.getUTCDate() + 1);
  }

  return dateList;
};

/**
 * Resolves normalized Date Range boundaries in UTC
 */
const resolveDateRange = (params = {}) => {
  let preset = params.preset;
  let dateFrom = params.dateFrom;
  let dateTo = params.dateTo;

  if (!preset) {
    if (dateFrom || dateTo) {
      preset = "custom";
    } else {
      preset = "all";
    }
  }

  const now = new Date();

  if (preset === "all") {
    return {
      preset: "all",
      startDate: null,
      endDate: null,
      dateFrom: null,
      dateTo: null,
      timezone: "UTC",
    };
  }

  let startDate = null;
  let endDate = new Date(now);

  if (preset === "7d") {
    startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() - 7);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);
  } else if (preset === "30d") {
    startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() - 30);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);
  } else if (preset === "90d") {
    startDate = new Date(now);
    startDate.setUTCDate(startDate.getUTCDate() - 90);
    startDate.setUTCHours(0, 0, 0, 0);
    endDate.setUTCHours(23, 59, 59, 999);
  } else if (preset === "custom") {
    const fromD = new Date(dateFrom);
    const toD = new Date(dateTo);

    fromD.setUTCHours(0, 0, 0, 0);
    toD.setUTCHours(23, 59, 59, 999);

    startDate = fromD;
    endDate = toD;
  }

  return {
    preset,
    startDate,
    endDate,
    dateFrom: startDate ? startDate.toISOString() : null,
    dateTo: endDate ? endDate.toISOString() : null,
    timezone: "UTC",
  };
};

/**
 * Service logic to aggregate and calculate platform-wide analytics with date filtering and time-series trends
 */
const getPlatformAnalytics = async (params = {}) => {
  const dateRangeInfo = resolveDateRange(params);

  const [rawMetrics, rawTrends] = await Promise.all([
    analyticsRepository.getPlatformAnalyticsMetrics({
      startDate: dateRangeInfo.startDate,
      endDate: dateRangeInfo.endDate,
    }),
    analyticsRepository.getPlatformAnalyticsTrends({
      startDate: dateRangeInfo.startDate,
      endDate: dateRangeInfo.endDate,
    }),
  ]);

  const totalCompanies = Number(rawMetrics.totalCompanies || 0);
  const activeJobs = Number(rawMetrics.activeJobs || 0);
  const totalAssessmentsCreated = Number(rawMetrics.totalAssessmentsCreated || 0);
  const assessedCandidates = Number(rawMetrics.assessedCandidates || 0);
  const testsCompleted = Number(rawMetrics.testsCompleted || 0);
  const totalStartedAttempts = Number(rawMetrics.totalStartedAttempts || 0);

  // Safely calculate average completion rate
  let averageCompletionRate = 0;
  if (totalStartedAttempts > 0) {
    averageCompletionRate = Math.min(
      100,
      Math.max(0, Math.round((testsCompleted / totalStartedAttempts) * 100))
    );
  }

  // Safely calculate average candidate score
  let averageCandidateScore = 0;
  if (rawMetrics.rawAvgPercentage !== null && rawMetrics.rawAvgPercentage !== undefined) {
    averageCandidateScore = Math.min(
      100,
      Math.max(0, Math.round(Number(rawMetrics.rawAvgPercentage) * 10) / 10)
    );
  }

  // Format game usage statistics
  const formattedGames = (rawMetrics.games || []).map((game) => {
    const attemptsCount = game._count?.attempts || 0;
    const assessmentsCount = game._count?.assessments || 0;
    const testVolume = Math.max(attemptsCount, assessmentsCount);

    return {
      id: game.id,
      name: game.name,
      code: game.code,
      description: game.description || "",
      category: "Cognitive",
      averagePlayTime: "3-5 mins",
      assessmentsUsedIn: testVolume,
      isActive: Boolean(game.isActive),
    };
  });

  formattedGames.sort((a, b) => b.assessmentsUsedIn - a.assessmentsUsedIn);

  // ----------------------------------------------------
  // BUILD ZERO-FILLED TREND TIME SERIES
  // ----------------------------------------------------
  let dateSeries = [];
  if (dateRangeInfo.startDate && dateRangeInfo.endDate) {
    dateSeries = generateDateSeries(dateRangeInfo.startDate, dateRangeInfo.endDate);
  } else {
    // If unbounded (preset=all), collect dates from trends or default to last 30 days
    const startedDates = (rawTrends.startedByDate || []).map((row) => row.date);
    const submittedDates = (rawTrends.submittedByDate || []).map((row) => row.date);
    const allUniqueDates = Array.from(new Set([...startedDates, ...submittedDates])).sort();

    if (allUniqueDates.length > 0) {
      dateSeries = generateDateSeries(
        new Date(allUniqueDates[0] + "T00:00:00.000Z"),
        new Date()
      );
    } else {
      const now = new Date();
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);
      dateSeries = generateDateSeries(thirtyDaysAgo, now);
    }
  }

  const startedMap = {};
  (rawTrends.startedByDate || []).forEach((row) => {
    if (row.date) {
      startedMap[row.date] = {
        startedCandidates: Number(row.startedCandidates || 0),
        startedAttempts: Number(row.startedAttempts || 0),
      };
    }
  });

  const submittedMap = {};
  (rawTrends.submittedByDate || []).forEach((row) => {
    if (row.date) {
      submittedMap[row.date] = {
        submittedAttempts: Number(row.submittedAttempts || 0),
        avgScore: Number(row.avgScore || 0),
      };
    }
  });

  const candidateActivity = [];
  const testCompletion = [];
  const averageScoreTrend = [];
  const completionRateTrend = [];

  dateSeries.forEach((dateStr) => {
    const sInfo = startedMap[dateStr] || { startedCandidates: 0, startedAttempts: 0 };
    const subInfo = submittedMap[dateStr] || { submittedAttempts: 0, avgScore: 0 };

    const startedCandidates = sInfo.startedCandidates;
    const startedAttempts = sInfo.startedAttempts;
    const submittedAttempts = subInfo.submittedAttempts;

    let dailyAvgScore = 0;
    if (submittedAttempts > 0 && subInfo.avgScore) {
      dailyAvgScore = Math.min(100, Math.max(0, Math.round(subInfo.avgScore * 10) / 10));
    }

    let dailyCompRate = 0;
    if (startedAttempts > 0) {
      dailyCompRate = Math.min(
        100,
        Math.max(0, Math.round((submittedAttempts / startedAttempts) * 10000) / 100)
      );
    }

    candidateActivity.push({
      date: dateStr,
      started: startedCandidates,
      completed: submittedAttempts,
    });

    testCompletion.push({
      date: dateStr,
      started: startedAttempts,
      submitted: submittedAttempts,
    });

    averageScoreTrend.push({
      date: dateStr,
      averageScore: dailyAvgScore,
    });

    completionRateTrend.push({
      date: dateStr,
      completionRate: dailyCompRate,
    });
  });

  return {
    summary: {
      totalCompanies,
      activeJobs,
      totalAssessmentsCreated,
      assessedCandidates,
      totalCandidatesAssessed: assessedCandidates,
      testsCompleted,
      averageCompletionRate,
      averageCandidateScore,
      averageScore: averageCandidateScore,
    },
    games: formattedGames,
    dateRange: {
      preset: dateRangeInfo.preset,
      dateFrom: dateRangeInfo.dateFrom,
      dateTo: dateRangeInfo.dateTo,
      timezone: dateRangeInfo.timezone,
    },
    trends: {
      candidateActivity,
      testCompletion,
      averageScore: averageScoreTrend,
      completionRate: completionRateTrend,
    },
  };
};

/**
 * Helper for RFC 4180 safe CSV value escaping
 */
const escapeCsvValue = (val) => {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

/**
 * Format date range into human-readable label
 */
const getReadableDateRangeLabel = (dateRange) => {
  const { preset, dateFrom, dateTo } = dateRange || {};
  if (preset === "7d") return "Last 7 Days";
  if (preset === "30d") return "Last 30 Days";
  if (preset === "90d") return "Last 90 Days";
  if (preset === "all") return "All Time";
  if (dateFrom && dateTo) {
    const f = String(dateFrom).split("T")[0];
    const t = String(dateTo).split("T")[0];
    return `${f} to ${t}`;
  }
  return "All Time";
};

/**
 * Generate sanitized, deterministic download filename
 */
const generateExportFilename = (dateRange, ext) => {
  const { preset, dateFrom, dateTo } = dateRange || {};
  const cleanExt = String(ext || "csv").replace(/^\./, "");

  if (preset && preset !== "custom") {
    return `hirequest-platform-analytics-${preset}.${cleanExt}`;
  }

  if (dateFrom && dateTo) {
    const f = String(dateFrom).split("T")[0].replace(/[^0-9-]/g, "");
    const t = String(dateTo).split("T")[0].replace(/[^0-9-]/g, "");
    if (f && t) {
      return `hirequest-platform-analytics-${f}-to-${t}.${cleanExt}`;
    }
  }

  return `hirequest-platform-analytics-custom.${cleanExt}`;
};

/**
 * Format normalized platform analytics data into CSV string format
 */
const generateAnalyticsCsv = (analyticsData) => {
  const { summary = {}, games = [], dateRange = {}, trends = {} } = analyticsData;
  const dateRangeStr = getReadableDateRangeLabel(dateRange);
  const nowStr = new Date().toISOString();

  const lines = [];

  // 1. Metadata Section
  lines.push("Metric,Value");
  lines.push(`Report,${escapeCsvValue("Platform Analytics")}`);
  lines.push(`Date Range,${escapeCsvValue(dateRangeStr)}`);
  lines.push(`Timezone,${escapeCsvValue("UTC")}`);
  lines.push(`Generated At,${escapeCsvValue(nowStr)}`);
  lines.push("");

  // 2. Summary Section
  lines.push("Summary");
  lines.push("Metric,Value");
  lines.push(`Total Companies,${summary.totalCompanies ?? 0}`);
  lines.push(`Active Jobs,${summary.activeJobs ?? 0}`);
  lines.push(`Assessed Candidates,${summary.assessedCandidates ?? 0}`);
  lines.push(`Tests Completed,${summary.testsCompleted ?? 0}`);
  lines.push(`Average Completion Rate,${summary.averageCompletionRate ?? 0}%`);
  lines.push(`Average Candidate Score,${summary.averageCandidateScore ?? 0}%`);
  lines.push("");

  // 3. Candidate Activity Section
  lines.push("Candidate Activity");
  lines.push("Date,Started,Completed");
  (trends.candidateActivity || []).forEach((row) => {
    lines.push(`${escapeCsvValue(row.date)},${row.started ?? 0},${row.completed ?? 0}`);
  });
  lines.push("");

  // 4. Test Completion Section
  lines.push("Test Completion");
  lines.push("Date,Started,Submitted");
  (trends.testCompletion || []).forEach((row) => {
    lines.push(`${escapeCsvValue(row.date)},${row.started ?? 0},${row.submitted ?? 0}`);
  });
  lines.push("");

  // 5. Average Score Section
  lines.push("Average Score");
  lines.push("Date,Average Score");
  (trends.averageScore || []).forEach((row) => {
    lines.push(`${escapeCsvValue(row.date)},${row.averageScore ?? 0}%`);
  });
  lines.push("");

  // 6. Completion Rate Section
  lines.push("Completion Rate");
  lines.push("Date,Completion Rate");
  (trends.completionRate || []).forEach((row) => {
    lines.push(`${escapeCsvValue(row.date)},${row.completionRate ?? 0}%`);
  });
  lines.push("");

  // 7. Game Usage Section
  lines.push("Game Usage");
  lines.push("Game,Code,Category,Assessments Used,Average Play Time,Active");
  if (games.length > 0) {
    games.forEach((g) => {
      lines.push(
        `${escapeCsvValue(g.name)},${escapeCsvValue(g.code)},${escapeCsvValue(g.category)},${g.assessmentsUsedIn ?? 0},${escapeCsvValue(g.averagePlayTime)},${g.isActive}`
      );
    });
  }

  return lines.join("\n");
};

/**
 * Format normalized platform analytics data into professional PDF Buffer
 */
const generateAnalyticsPdf = (analyticsData) => {
  const PDFDocument = require("pdfkit");

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
      const buffers = [];

      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      const { summary = {}, games = [], dateRange = {}, trends = {} } = analyticsData;
      const dateRangeStr = getReadableDateRangeLabel(dateRange);
      const nowStr = new Date().toISOString().replace("T", " ").substring(0, 19) + " UTC";

      const primaryColor = "#0f172a";
      const brandColor = "#2563eb";
      const textColor = "#334155";
      const mutedColor = "#64748b";
      const lightBg = "#f8fafc";

      let y = 40;

      // Header Banner
      doc.rect(40, y, 515, 60).fill("#1e293b");

      doc.fillColor("#ffffff")
        .font("Helvetica-Bold")
        .fontSize(20)
        .text("HireQuest", 55, y + 12);

      doc.fontSize(12)
        .font("Helvetica")
        .fillColor("#94a3b8")
        .text("Platform Analytics Report", 55, y + 34);

      y += 75;

      // Metadata Block
      doc.fillColor(textColor).font("Helvetica-Bold").fontSize(10);
      doc.text("Date Range: ", 40, y, { continued: true });
      doc.font("Helvetica").text(dateRangeStr);

      doc.font("Helvetica-Bold").text("Timezone: ", 40, y + 14, { continued: true });
      doc.font("Helvetica").text("UTC");

      doc.font("Helvetica-Bold").text("Generated At: ", 40, y + 28, { continued: true });
      doc.font("Helvetica").text(nowStr);

      y += 50;

      const checkPageBreak = (neededHeight) => {
        if (y + neededHeight > 770) {
          doc.addPage();
          y = 40;
        }
      };

      const renderSectionHeader = (title) => {
        checkPageBreak(40);
        doc.rect(40, y, 515, 22).fill(lightBg);
        doc.fillColor(brandColor).font("Helvetica-Bold").fontSize(10).text(title.toUpperCase(), 48, y + 6);
        y += 28;
      };

      // 1. EXECUTIVE SUMMARY
      renderSectionHeader("Executive Summary");

      const summaryItems = [
        { label: "Total Companies", value: String(summary.totalCompanies ?? 0) },
        { label: "Active Jobs", value: String(summary.activeJobs ?? 0) },
        { label: "Assessed Candidates", value: String(summary.assessedCandidates ?? 0) },
        { label: "Tests Completed", value: String(summary.testsCompleted ?? 0) },
        { label: "Average Completion Rate", value: `${summary.averageCompletionRate ?? 0}%` },
        { label: "Average Candidate Score", value: `${summary.averageCandidateScore ?? 0}%` },
      ];

      const cardWidth = 250;
      const cardHeight = 34;
      summaryItems.forEach((item, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const cardX = 40 + col * 265;
        const cardY = y + row * 40;

        doc.rect(cardX, cardY, cardWidth, cardHeight).lineWidth(0.5).stroke("#e2e8f0");
        doc.fillColor(mutedColor).font("Helvetica").fontSize(8.5).text(item.label, cardX + 10, cardY + 5);
        doc.fillColor(primaryColor).font("Helvetica-Bold").fontSize(11).text(item.value, cardX + 10, cardY + 17);
      });

      y += Math.ceil(summaryItems.length / 2) * 40 + 15;

      // Table Helper
      const drawTable = (headers, rows, colWidths, alignment = []) => {
        const rowHeight = 20;

        checkPageBreak(rowHeight + 10);
        doc.rect(40, y, 515, rowHeight).fill("#334155");
        let currentX = 40;
        headers.forEach((h, i) => {
          doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(8.5).text(h, currentX + 6, y + 5, {
            width: colWidths[i] - 12,
            align: alignment[i] || "left",
          });
          currentX += colWidths[i];
        });
        y += rowHeight;

        if (rows.length === 0) {
          checkPageBreak(rowHeight);
          doc.rect(40, y, 515, rowHeight).fill(lightBg);
          doc.fillColor(mutedColor).font("Helvetica-Oblique").fontSize(8.5).text("No activity for selected period.", 48, y + 5);
          y += rowHeight + 12;
          return;
        }

        rows.forEach((row, rowIndex) => {
          checkPageBreak(rowHeight);
          const bg = rowIndex % 2 === 0 ? "#ffffff" : lightBg;
          doc.rect(40, y, 515, rowHeight).fill(bg);

          let cellX = 40;
          row.forEach((cell, cellIdx) => {
            doc.fillColor(textColor).font("Helvetica").fontSize(8.5).text(String(cell), cellX + 6, y + 5, {
              width: colWidths[cellIdx] - 12,
              align: alignment[cellIdx] || "left",
            });
            cellX += colWidths[cellIdx];
          });
          y += rowHeight;
        });

        y += 15;
      };

      // 2. CANDIDATE ACTIVITY
      renderSectionHeader("Candidate Activity");
      const caRows = (trends.candidateActivity || []).map((r) => [r.date, r.started, r.completed]);
      drawTable(["Date", "Started Candidates", "Completed Tests"], caRows, [171, 172, 172], ["left", "right", "right"]);

      // 3. TEST COMPLETION
      renderSectionHeader("Test Completion");
      const tcRows = (trends.testCompletion || []).map((r) => [r.date, r.started, r.submitted]);
      drawTable(["Date", "Started Attempts", "Submitted Attempts"], tcRows, [171, 172, 172], ["left", "right", "right"]);

      // 4. AVERAGE SCORE TREND
      renderSectionHeader("Average Score Trend");
      const scoreRows = (trends.averageScore || []).map((r) => [r.date, `${r.averageScore}%`]);
      drawTable(["Date", "Average Candidate Score"], scoreRows, [257, 258], ["left", "right"]);

      // 5. COMPLETION RATE TREND
      renderSectionHeader("Completion Rate Trend");
      const compRows = (trends.completionRate || []).map((r) => [r.date, `${r.completionRate}%`]);
      drawTable(["Date", "Completion Rate"], compRows, [257, 258], ["left", "right"]);

      // 6. GAME USAGE
      renderSectionHeader("Game Usage");
      const gameRows = (games || []).map((g) => [
        g.name,
        g.category || "Cognitive",
        g.assessmentsUsedIn || 0,
        g.isActive ? "Active" : "Inactive",
      ]);
      if (gameRows.length === 0) {
        checkPageBreak(30);
        doc.rect(40, y, 515, 24).fill(lightBg);
        doc.fillColor(mutedColor).font("Helvetica-Oblique").fontSize(8.5).text("No game usage data available for the selected period.", 48, y + 7);
        y += 34;
      } else {
        drawTable(["Game Name", "Category", "Assessments Used", "Status"], gameRows, [160, 115, 130, 110], ["left", "left", "right", "center"]);
      }

      // 7. Footer / End of Report
      checkPageBreak(40);
      doc.moveDown(1);
      doc.strokeColor("#cbd5e1").lineWidth(0.5).lineCap("butt").moveTo(40, y).lineTo(555, y).stroke();
      y += 10;
      doc.fillColor(mutedColor).font("Helvetica-Bold").fontSize(8.5).text("END OF REPORT", 40, y, { align: "center", width: 515 });

      // Add Page Numbers
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fillColor("#94a3b8").font("Helvetica").fontSize(8).text(
          `Page ${i + 1} of ${range.count}  |  HireQuest Confidential`,
          40,
          800,
          { align: "center", width: 515 }
        );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  resolveDateRange,
  getPlatformAnalytics,
  generateDateSeries,
  escapeCsvValue,
  getReadableDateRangeLabel,
  generateExportFilename,
  generateAnalyticsCsv,
  generateAnalyticsPdf,
};

