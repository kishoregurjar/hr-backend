"use strict";

const prismaRaw = require("../../config/prisma");
const prisma = prismaRaw.prisma || prismaRaw;

const inMemoryResults = new Map();

async function findCandidateResult({ candidateAssessmentId, candidateId }) {
  const mem = inMemoryResults.get(candidateAssessmentId);
  if (mem) {
    if (
      candidateId &&
      mem.candidateId !== candidateId &&
      mem.userId !== candidateId &&
      mem.candidate?.userId !== candidateId
    ) {
      return null;
    }
    return mem;
  }

  try {
    if (prisma && prisma.candidateAttempt) {
      const where = {
        id: candidateAssessmentId,
      };

      const found = await prisma.candidateAttempt.findFirst({
        where,
        select: {
          id: true,
          candidateId: true,
          assessmentId: true,
          status: true,
          candidate: {
            select: {
              id: true,
              userId: true,
            },
          },
          assessment: {
            select: {
              id: true,
              title: true,
              passingScore: true,
              maximumScore: true,
            },
          },
          assessmentResult: {
            select: {
              id: true,
              score: true,
              percentage: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });

      if (found) {
        if (
          candidateId &&
          found.candidateId !== candidateId &&
          found.candidate?.userId !== candidateId
        ) {
          return null;
        }

        return {
          ...found,
          result: found.assessmentResult || found.result || null,
        };
      }
    }
  } catch (_err) {
    // Fallback
  }

  return null;
}

async function findAssessmentResults({
  assessmentId,
  status,
  search,
  page = 1,
  limit = 20,
  sortBy = "createdAt",
  sortOrder = "desc",
}) {
  const skip = (page - 1) * limit;

  let list = Array.from(inMemoryResults.values()).filter(
    (item) => item.assessmentId === assessmentId && item.result
  );

  if (list.length > 0) {
    if (status) {
      list = list.filter((item) => item.result.status === status);
    }

    if (search) {
      const s = search.toLowerCase();
      list = list.filter((item) => {
        const email = item.candidate?.email || "";
        const name = `${item.candidate?.firstName || ""} ${item.candidate?.lastName || ""}`;
        return email.toLowerCase().includes(s) || name.toLowerCase().includes(s);
      });
    }

    list.sort((a, b) => {
      let valA = a.result?.createdAt;
      let valB = b.result?.createdAt;
      if (sortBy === "percentage") {
        valA = a.result?.percentage ?? 0;
        valB = b.result?.percentage ?? 0;
      } else if (sortBy === "score") {
        valA = a.result?.score ?? 0;
        valB = b.result?.score ?? 0;
      } else if (sortBy === "candidateName") {
        valA = a.candidate?.firstName || "";
        valB = b.candidate?.firstName || "";
      } else if (sortBy === "candidateEmail") {
        valA = a.candidate?.email || "";
        valB = b.candidate?.email || "";
      }

      if (valA < valB) return sortOrder === "asc" ? -1 : 1;
      if (valA > valB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    const total = list.length;
    const items = list.slice(skip, skip + limit);

    return { items, total, page, limit };
  }

  try {
    if (prisma && prisma.candidateAttempt) {
      const where = {
        assessmentId,
        assessmentResult: {
          isNot: null,
          ...(status ? { status } : {}),
        },
      };

      if (search) {
        where.candidate = {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
          ],
        };
      }

      let orderBy;
      switch (sortBy) {
        case "percentage":
          orderBy = { assessmentResult: { percentage: sortOrder } };
          break;
        case "score":
          orderBy = { assessmentResult: { score: sortOrder } };
          break;
        case "candidateName":
          orderBy = { candidate: { firstName: sortOrder } };
          break;
        case "candidateEmail":
          orderBy = { candidate: { email: sortOrder } };
          break;
        default:
          orderBy = { assessmentResult: { createdAt: sortOrder } };
      }

      const [rawItems, total] = await prisma.$transaction([
        prisma.candidateAttempt.findMany({
          where,
          skip,
          take: limit,
          orderBy,
          select: {
            id: true,
            candidateId: true,
            candidate: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            assessmentResult: {
              select: {
                id: true,
                score: true,
                percentage: true,
                status: true,
                createdAt: true,
              },
            },
          },
        }),
        prisma.candidateAttempt.count({ where }),
      ]);

      const items = rawItems.map((item) => ({
        ...item,
        result: item.assessmentResult || item.result || null,
      }));

      return { items, total, page, limit };
    }
  } catch (_err) {
    // Fallback
  }

  return { items: [], total: 0, page, limit };
}

async function findResultDetails(candidateAssessmentId) {
  const mem = inMemoryResults.get(candidateAssessmentId);
  if (mem) {
    return mem;
  }

  try {
    if (prisma && prisma.candidateAttempt) {
      const found = await prisma.candidateAttempt.findUnique({
        where: { id: candidateAssessmentId },
        select: {
          id: true,
          candidateId: true,
          assessmentId: true,
          status: true,
          startedAt: true,
          submittedAt: true,
          candidate: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          assessment: {
            select: {
              id: true,
              title: true,
              passingScore: true,
              maximumScore: true,
            },
          },
          assessmentResult: {
            select: {
              id: true,
              score: true,
              percentage: true,
              status: true,
              createdAt: true,
            },
          },
          gameResults: {
            select: {
              id: true,
              gameId: true,
              score: true,
              createdAt: true,
              game: {
                select: {
                  id: true,
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
      });

      if (found) {
        return {
          ...found,
          result: found.assessmentResult || found.result || null,
        };
      }
    }
  } catch (_err) {
    // Fallback
  }

  return null;
}

async function findCandidateAttempts({ candidateAssessmentId, candidateId }) {
  const mem = inMemoryResults.get(candidateAssessmentId);
  if (mem) {
    return [
      {
        id: mem.id,
        attemptNumber: 1,
        status: mem.status || "SUBMITTED",
        startedAt: mem.startedAt || new Date(),
        expiresAt: mem.expiresAt || new Date(),
        submittedAt: mem.submittedAt || new Date(),
        score: mem.result?.score ?? null,
        percentage: mem.result?.percentage ?? null,
        passed: mem.result?.status === "PASS",
      },
    ];
  }

  try {
    if (prisma && prisma.candidateAttempt) {
      const targetAttempt = await prisma.candidateAttempt.findUnique({
        where: { id: candidateAssessmentId },
        select: { assessmentId: true, candidateId: true },
      });

      if (targetAttempt) {
        const where = {
          assessmentId: targetAttempt.assessmentId,
          candidateId: targetAttempt.candidateId,
        };

        const list = await prisma.candidateAttempt.findMany({
          where,
          select: {
            id: true,
            status: true,
            startedAt: true,
            expiresAt: true,
            submittedAt: true,
            score: true,
            percentage: true,
            result: true,
          },
          orderBy: {
            startedAt: "desc",
          },
        });

        if (list && list.length > 0) {
          return list.map((item, idx) => ({
            id: item.id,
            attemptNumber: list.length - idx,
            status: item.status,
            startedAt: item.startedAt,
            expiresAt: item.expiresAt,
            submittedAt: item.submittedAt,
            score: item.score,
            percentage: item.percentage,
            passed: item.result === "PASS",
          }));
        }
      }
    }
  } catch (_err) {
    // Fallback
  }

  return [];
}

function seedInMemoryResult(candidateAssessmentId, data) {
  inMemoryResults.set(candidateAssessmentId, data);
}

module.exports = {
  findCandidateResult,
  findAssessmentResults,
  findResultDetails,
  findCandidateAttempts,
  seedInMemoryResult,
};
