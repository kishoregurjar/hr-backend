"use strict";

const GAME_SLUGS = {
  ZIP: "zip",
  TANGO: "tango",
  SUDOKU: "sudoku",
  MAHJONG: "mahjong",
};

const GAMES_METADATA = [
  {
    id: "game_zip_grid",
    slug: GAME_SLUGS.ZIP,
    name: "Zip Pathfinder",
    title: "Zip Grid Pathfinder",
    description: "Connect numerical checkpoints in sequence from 1 to N through continuous adjacent movement without crossing maze walls.",
    category: "Spatial Reasoning",
    difficulty: "Medium",
    duration: 6,
    skill: "Spatial Path Planning",
    scoringMetric: "Path Accuracy & Speed",
    config: {
      gridSize: 8,
      minClues: 10,
      maxClues: 15,
    },
  },
  {
    id: "game_tango_grid",
    slug: GAME_SLUGS.TANGO,
    name: "Tango Deduction",
    title: "Tango Spatial Deduction",
    description: "Binary deduction puzzle placing Sun and Moon symbols respecting row/column balances, no 3-in-a-row, and relational constraints.",
    category: "Deductive Logic",
    difficulty: "Medium",
    duration: 8,
    skill: "Constraint Satisfaction",
    scoringMetric: "Constraint Accuracy & Efficiency",
    config: {
      size: 6,
      difficulty: "medium",
    },
  },
  {
    id: "game_mini_sudoku",
    slug: GAME_SLUGS.SUDOKU,
    name: "Mini Sudoku",
    title: "Mini Sudoku 6x6 Challenge",
    description: "6x6 Mini Sudoku with 2x3 blocks testing quantitative reasoning, logical deduction, and working memory.",
    category: "Quantitative Reasoning",
    difficulty: "Medium",
    duration: 10,
    skill: "Logical Deduction",
    scoringMetric: "Completion Time & Error Count",
    config: {
      size: 6,
      difficulty: "medium",
    },
  },
  {
    id: "game_mahjong_match",
    slug: GAME_SLUGS.MAHJONG,
    name: "Mahjong Tile Match",
    title: "Mahjong Tile Match Strategy",
    description: "Classic authentic Mahjong tile matching game with line-of-sight clearing, sliding push mechanics, and combo streaks.",
    category: "Visual Recognition",
    difficulty: "Medium",
    duration: 7,
    skill: "Visual Scanning & Pattern Matching",
    scoringMetric: "Matches, Combos & Speed",
    config: {
      difficulty: "medium",
      rows: 6,
      cols: 8,
    },
  },
];

module.exports = {
  GAME_SLUGS,
  GAMES_METADATA,
};
