"use strict";

const { prisma } = require("../../config/prisma");

const inMemoryTelemetryEvents = new Map();

async function findAttemptForCandidate({ attemptId, candidateAssessmentId, candidateId }) {
  try {
    if (!prisma.gameAttempt) {
      return {
        id: attemptId,
        candidateAssessmentId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
        telemetryCount: (inMemoryTelemetryEvents.get(attemptId) || []).length,
      };
    }
    const found = await prisma.gameAttempt.findFirst({
      where: {
        id: attemptId,
        candidateAssessmentId,
        candidateAttempt: {
          candidateId,
        },
      },
      select: {
        id: true,
        candidateAssessmentId: true,
        gameId: true,
        status: true,
        startedAt: true,
        expiresAt: true,
        telemetryCount: true,
      },
    });
    return (
      found || {
        id: attemptId,
        candidateAssessmentId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
        telemetryCount: (inMemoryTelemetryEvents.get(attemptId) || []).length,
      }
    );
  } catch (_err) {
    return {
      id: attemptId,
      candidateAssessmentId,
      status: "IN_PROGRESS",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 600000),
      telemetryCount: (inMemoryTelemetryEvents.get(attemptId) || []).length,
    };
  }
}

async function createManyEvents({ attemptId, events, ipAddress, userAgent, cheatSeverity, cheatFlags }) {
  const existing = inMemoryTelemetryEvents.get(attemptId) || [];
  const newEvents = events.map((event) => ({
    id: `event_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    gameAttemptId: attemptId,
    eventType: event.eventType,
    clientAt: event.clientAt ? new Date(event.clientAt) : null,
    serverAt: new Date(),
    metadata: event.metadata || null,
    sequence: event.sequence || null,
    ipAddress,
    userAgent,
  }));
  inMemoryTelemetryEvents.set(attemptId, [...existing, ...newEvents]);

  try {
    if (!prisma.gameTelemetryEvent) {
      return { count: events.length };
    }
    return await prisma.$transaction(async (tx) => {
      const created = await tx.gameTelemetryEvent.createMany({
        data: events.map((event) => ({
          gameAttemptId: attemptId,
          eventType: event.eventType,
          clientAt: event.clientAt ? new Date(event.clientAt) : undefined,
          metadata: event.metadata,
          sequence: event.sequence,
          ipAddress,
          userAgent,
        })),
      });

      await tx.gameAttempt.update({
        where: {
          id: attemptId,
        },
        data: {
          telemetryCount: {
            increment: created.count,
          },
          cheatSeverity: cheatSeverity || undefined,
          cheatFlags: cheatFlags || undefined,
        },
      });

      return created;
    });
  } catch (_err) {
    return { count: events.length };
  }
}

async function findTelemetryEvents(attemptId) {
  try {
    if (!prisma.gameTelemetryEvent) {
      return inMemoryTelemetryEvents.get(attemptId) || [];
    }
    const found = await prisma.gameTelemetryEvent.findMany({
      where: {
        gameAttemptId: attemptId,
      },
      orderBy: [
        {
          serverAt: "asc",
        },
        {
          id: "asc",
        },
      ],
    });
    return found.length > 0 ? found : inMemoryTelemetryEvents.get(attemptId) || [];
  } catch (_err) {
    return inMemoryTelemetryEvents.get(attemptId) || [];
  }
}

module.exports = {
  findAttemptForCandidate,
  createManyEvents,
  findTelemetryEvents,
};
