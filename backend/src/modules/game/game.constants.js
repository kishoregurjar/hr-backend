"use strict";

const GAME_SLUGS = Object.freeze({
  ZIP: "zip",
  TANGO: "tango",
  SUDOKU: "sudoku",
  MAHJONG: "mahjong",
});

const GAME_CODES = Object.freeze({
  ZIP_PATHFINDER: "ZIP_PATHFINDER",
  TANGO: "TANGO",
  MINI_SUDOKU: "MINI_SUDOKU",
  MAHJONG_TILE_MATCH: "MAHJONG_TILE_MATCH",
});

const GAMES_METADATA = Object.freeze([
  Object.freeze({
    id: "game_zip_grid",
    code: GAME_CODES.ZIP_PATHFINDER,
    slug: GAME_SLUGS.ZIP,
    name: "Zip Pathfinder",
    title: "Zip Grid Pathfinder",
    description:
      "Continuous pathfinding puzzle that evaluates spatial reasoning and planning.",
    category: "COGNITIVE",
    difficulty: "Medium",
    duration: 6,
    skill: "Spatial Path Planning",
    scoringMetric: "Path Accuracy & Speed",
    supportedDifficulties: ["EASY", "MEDIUM", "HARD"],
    config: {
      gridSize: 8,
      minClues: 10,
      maxClues: 15,
    },
  }),
  Object.freeze({
    id: "game_tango_grid",
    code: GAME_CODES.TANGO,
    slug: GAME_SLUGS.TANGO,
    name: "Tango Deduction",
    title: "Tango Spatial Deduction",
    description:
      "Binary deduction puzzle based on balance and adjacency constraints.",
    category: "COGNITIVE",
    difficulty: "Medium",
    duration: 8,
    skill: "Constraint Satisfaction",
    scoringMetric: "Constraint Accuracy & Efficiency",
    supportedDifficulties: ["EASY", "MEDIUM", "HARD"],
    config: {
      size: 6,
      difficulty: "medium",
    },
  }),
  Object.freeze({
    id: "game_mini_sudoku",
    code: GAME_CODES.MINI_SUDOKU,
    slug: GAME_SLUGS.SUDOKU,
    name: "Mini Sudoku",
    title: "Mini Sudoku 6x6 Challenge",
    description:
      "6x6 Sudoku puzzle evaluating logical and quantitative reasoning.",
    category: "COGNITIVE",
    difficulty: "Medium",
    duration: 10,
    skill: "Logical Deduction",
    scoringMetric: "Completion Time & Error Count",
    supportedDifficulties: ["EASY", "MEDIUM", "HARD"],
    config: {
      size: 6,
      difficulty: "medium",
    },
  }),
  Object.freeze({
    id: "game_mahjong_match",
    code: GAME_CODES.MAHJONG_TILE_MATCH,
    slug: GAME_SLUGS.MAHJONG,
    name: "Mahjong Tile Match",
    title: "Mahjong Tile Match Strategy",
    description:
      "Layered tile matching game evaluating visual recognition and processing speed.",
    category: "COGNITIVE",
    difficulty: "Medium",
    duration: 7,
    skill: "Visual Scanning & Pattern Matching",
    supportedDifficulties: ["EASY", "MEDIUM", "HARD"],
    config: {
      difficulty: "medium",
      rows: 6,
      cols: 8,
    },
  }),
]);

module.exports = {
  GAME_SLUGS,
  GAME_CODES,
  GAMES_METADATA,
};
