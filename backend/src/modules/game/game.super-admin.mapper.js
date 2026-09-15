"use strict";

function mapGame(game, metadata = null) {
  const mergedMetadata = metadata || {};
  return {
    id: game?.id || mergedMetadata.id || game?.code || mergedMetadata.code,
    code: game?.code || mergedMetadata.code || game?.id,
    name: game?.name || mergedMetadata.name,
    title: mergedMetadata.title || game?.name,
    description: game?.description || mergedMetadata.description || null,
    isActive: game?.isActive !== undefined ? Boolean(game.isActive) : true,
    slug: mergedMetadata.slug || null,
    category: mergedMetadata.category || "COGNITIVE",
    difficulty: mergedMetadata.difficulty || "Medium",
    duration: mergedMetadata.duration || 10,
    skill: mergedMetadata.skill || null,
    scoringMetric: mergedMetadata.scoringMetric || null,
    supportedDifficulties: mergedMetadata.supportedDifficulties || [
      "EASY",
      "MEDIUM",
      "HARD",
    ],
    config: mergedMetadata.config || {},
    createdAt: game?.createdAt || new Date(),
    updatedAt: game?.updatedAt || new Date(),
  };
}

module.exports = {
  mapGame,
};
