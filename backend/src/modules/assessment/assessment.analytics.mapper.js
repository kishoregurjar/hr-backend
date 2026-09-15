"use strict";

function round(value, decimals = 2) {
  if (!Number.isFinite(Number(value))) {
    return 0;
  }
  const factor = 10 ** decimals;
  return Math.round(Number(value) * factor) / factor;
}

function mapOverview({
  assessment,
  resultStats,
  resultStatusStats = [],
  assignmentStats = [],
  attemptStats = [],
}) {
  const totalAssignments = assignmentStats.reduce(
    (sum, item) => sum + (item._count?._all ?? item._count ?? 0),
    0
  );

  const completedAssignments =
    assignmentStats.find(
      (item) => item.status === "SUBMITTED" || item.status === "COMPLETED"
    )?._count?._all ??
    assignmentStats.find(
      (item) => item.status === "SUBMITTED" || item.status === "COMPLETED"
    )?._count ??
    0;

  const totalResults = resultStats._count?._all ?? resultStats._count ?? 0;

  const passCount =
    resultStatusStats.find((item) => item.status === "PASS")?._count?._all ??
    resultStatusStats.find((item) => item.status === "PASS")?._count ??
    0;

  const failCount =
    resultStatusStats.find((item) => item.status === "FAIL")?._count?._all ??
    resultStatusStats.find((item) => item.status === "FAIL")?._count ??
    0;

  const attemptSubmitted =
    attemptStats.find((item) => item.status === "SUBMITTED")?._count?._all ??
    attemptStats.find((item) => item.status === "SUBMITTED")?._count ??
    0;

  const attemptExpired =
    attemptStats.find((item) => item.status === "EXPIRED")?._count?._all ??
    attemptStats.find((item) => item.status === "EXPIRED")?._count ??
    0;

  return {
    assessment: {
      id: assessment.id,
      title: assessment.title,
      passingScore: assessment.passingScore,
      maximumScore: assessment.maximumScore,
      durationMinutes: assessment.durationMinutes,
      maxAttempts: assessment.maxAttempts || 1,
      status: assessment.status,
    },

    candidates: {
      assigned: totalAssignments,
      completed: completedAssignments,
      completionRate:
        totalAssignments > 0
          ? round((completedAssignments / totalAssignments) * 100)
          : 0,
    },

    results: {
      total: totalResults,
      averageScore: round(resultStats._avg?.score ?? 0),
      averagePercentage: round(resultStats._avg?.percentage ?? 0),
      passed: passCount,
      failed: failCount,
      passRate:
        totalResults > 0 ? round((passCount / totalResults) * 100) : 0,
      failRate:
        totalResults > 0 ? round((failCount / totalResults) * 100) : 0,
    },

    attempts: {
      submitted: attemptSubmitted,
      expired: attemptExpired,
    },
  };
}

function mapDistribution(results) {
  const buckets = [
    { key: "0_20", label: "0-20", min: 0, max: 20 },
    { key: "21_40", label: "21-40", min: 21, max: 40 },
    { key: "41_60", label: "41-60", min: 41, max: 60 },
    { key: "61_80", label: "61-80", min: 61, max: 80 },
    { key: "81_100", label: "81-100", min: 81, max: 100 },
  ];

  const distribution = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: 0,
    percentage: 0,
  }));

  for (const result of results) {
    const percentage = Number(result.percentage ?? 0);

    const bucket = buckets.find(
      (item) => percentage >= item.min && percentage <= item.max
    );

    if (bucket) {
      const target = distribution.find((item) => item.key === bucket.key);
      if (target) {
        target.count += 1;
      }
    }
  }

  const total = results.length;

  for (const item of distribution) {
    item.percentage = total > 0 ? round((item.count / total) * 100) : 0;
  }

  return {
    total,
    distribution,
  };
}

function mapGameAnalytics(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const gameId = row.game?.id || row.gameId;

    if (!grouped.has(gameId)) {
      grouped.set(gameId, {
        gameId,
        gameName: row.game?.name || "Game",
        gameCode: row.game?.code || "GAME",
        attempts: 0,
        totalScore: 0,
        scores: [],
      });
    }

    const item = grouped.get(gameId);
    const sc = Number(row.score ?? 0);

    item.attempts += 1;
    item.totalScore += sc;
    item.scores.push(sc);
  }

  return Array.from(grouped.values()).map((item) => ({
    gameId: item.gameId,
    gameName: item.gameName,
    gameCode: item.gameCode,
    attempts: item.attempts,
    averageScore:
      item.attempts > 0 ? round(item.totalScore / item.attempts) : 0,
    highestScore: item.scores.length > 0 ? Math.max(...item.scores) : 0,
    lowestScore: item.scores.length > 0 ? Math.min(...item.scores) : 0,
  }));
}

function mapQuestionAnalytics(rows, total, page, limit) {
  return {
    rows: rows.map((row) => ({
      questionId: row.questionId,
      questionTitle: row.questionTitle,
      sequence: row.questionSequence ?? row.sequence ?? 1,
      marks: row.marks,
      negativeMarks: row.negativeMarks,
      attempts: row.attempts,
      correct: row.correct,
      incorrect: row.incorrect,
      unanswered: row.unanswered,
      accuracy: round(row.accuracy),
      averageMarks: round(row.averageMarks),
    })),

    pagination: {
      page,
      limit,
      total,
      totalPages: total > 0 ? Math.ceil(total / limit) : 0,
    },
  };
}

module.exports = {
  round,
  mapOverview,
  mapDistribution,
  mapGameAnalytics,
  mapQuestionAnalytics,
};
