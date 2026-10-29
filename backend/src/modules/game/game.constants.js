"use strict";

const GAME_SLUGS = Object.freeze({
  ZIP: "zip",
  TANGO: "tango",
  SUDOKU: "sudoku",
  MAHJONG: "mahjong",
  N_QUEENS: "n-queens",
});

const GAME_CODES = Object.freeze({
  ZIP_PATHFINDER: "ZIP_PATHFINDER",
  TANGO: "TANGO",
  MINI_SUDOKU: "MINI_SUDOKU",
  MAHJONG_TILE_MATCH: "MAHJONG_TILE_MATCH",
  N_QUEENS: "N_QUEENS",
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
    difficulty: "Easy",
    duration: 6,
    skill: "Spatial Path Planning",
    scoringMetric: "Path Accuracy & Speed",
    supportedDifficulties: ["EASY", "MEDIUM", "HARD"],
    config: {
      difficulty: "easy",
      gridSize: 5,
      minClues: 6,
      maxClues: 10,
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
    difficulty: "Easy",
    duration: 8,
    skill: "Constraint Satisfaction",
    scoringMetric: "Constraint Accuracy & Efficiency",
    supportedDifficulties: ["EASY", "MEDIUM", "HARD"],
    config: {
      size: 6,
      difficulty: "easy",
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
    difficulty: "Easy",
    duration: 10,
    skill: "Logical Deduction",
    scoringMetric: "Completion Time & Error Count",
    supportedDifficulties: ["EASY", "MEDIUM", "HARD"],
    config: {
      size: 6,
      difficulty: "easy",
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
    difficulty: "Easy",
    duration: 7,
    skill: "Visual Scanning & Pattern Matching",
    supportedDifficulties: ["EASY", "MEDIUM", "HARD"],
    config: {
      difficulty: "easy",
      rows: 5,
      cols: 6,
    },
  }),
  Object.freeze({
    id: "game_n_queens",
    code: GAME_CODES.N_QUEENS,
    slug: GAME_SLUGS.N_QUEENS,
    name: "N-Queens Spatial Logic",
    title: "N-Queens Spatial Deduction",
    description:
      "Place N queens on a chessboard so no two queens attack each other across rows, columns, or diagonals.",
    category: "COGNITIVE",
    difficulty: "Medium",
    duration: 8,
    skill: "Constraint Satisfaction & Backtracking",
    scoringMetric: "Constraint Accuracy & Placement Speed",
    supportedDifficulties: ["EASY", "MEDIUM", "HARD"],
    config: {
      size: 8,
      difficulty: "medium",
    },
  }),
]);

const getCanonicalGameCode = (input) => {
  if (!input) return null;
  const str = String(
    typeof input === "object"
      ? input.code || input.slug || input.id || input.gameId || input.name || input.title || ""
      : input
  )
    .toLowerCase()
    .trim();

  if (str.includes("zip") || str.includes("pathfinder")) return GAME_CODES.ZIP_PATHFINDER;
  if (str.includes("tango")) return GAME_CODES.TANGO;
  if (str.includes("sudoku")) return GAME_CODES.MINI_SUDOKU;
  if (str.includes("mahjong")) return GAME_CODES.MAHJONG_TILE_MATCH;
  if (str.includes("queen")) return GAME_CODES.N_QUEENS;
  return null;
};

const GAME_DIFFICULTY_DURATIONS = Object.freeze({
  zip: Object.freeze({ EASY: 2, MEDIUM: 3.5, HARD: 5 }),
  tango: Object.freeze({ EASY: 2.5, MEDIUM: 3.5, HARD: 5 }),
  sudoku: Object.freeze({ EASY: 2.5, MEDIUM: 4, HARD: 6 }),
  mahjong: Object.freeze({ EASY: 2, MEDIUM: 3, HARD: 4.5 }),
  nqueens: Object.freeze({ EASY: 2.5, MEDIUM: 3.5, HARD: 5 }),
  card_match: Object.freeze({ EASY: 1, MEDIUM: 1.5, HARD: 2.5 }),
  maze_escape: Object.freeze({ EASY: 1, MEDIUM: 1.5, HARD: 2.5 }),
  pattern_memory: Object.freeze({ EASY: 1.5, MEDIUM: 2.5, HARD: 4 }),
});

const getGameDurationForDifficulty = (gameSlugOrId, difficulty = "MEDIUM") => {
  const code = getCanonicalGameCode(gameSlugOrId);
  const diff = String(difficulty || "MEDIUM").toUpperCase();
  let key = "zip";
  if (code === GAME_CODES.TANGO) key = "tango";
  else if (code === GAME_CODES.MINI_SUDOKU) key = "sudoku";
  else if (code === GAME_CODES.MAHJONG_TILE_MATCH) key = "mahjong";
  else if (code === GAME_CODES.N_QUEENS) key = "nqueens";

  const table = GAME_DIFFICULTY_DURATIONS[key];
  if (table && typeof table[diff] === "number") {
    return table[diff];
  }
  return diff === "EASY" ? 2 : diff === "HARD" ? 5 : 3.5;
};

module.exports = {
  GAME_SLUGS,
  GAME_CODES,
  GAMES_METADATA,
  GAME_DIFFICULTY_DURATIONS,
  getCanonicalGameCode,
  getGameDurationForDifficulty,
};
