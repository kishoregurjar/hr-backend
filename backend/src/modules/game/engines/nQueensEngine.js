"use strict";

/**
 * LinkedIn Queens Puzzle Engine
 * Rules:
 *  1. Exactly ONE Queen per row.
 *  2. Exactly ONE Queen per column.
 *  3. Exactly ONE Queen per color region.
 *  4. Two Queens CANNOT touch each other (not even diagonally - King's move distance <= 1 prohibited).
 *  5. Initial state: 100% EMPTY board (no queens pre-filled).
 */

const LINKEDIN_QUEENS_PUZZLES = {
  easy: [
    {
      size: 6,
      targetQueens: 6,
      regions: [
        [0, 0, 0, 1, 1, 2],
        [0, 0, 1, 1, 1, 2],
        [3, 3, 4, 1, 2, 2],
        [3, 3, 4, 4, 2, 2],
        [3, 4, 4, 4, 5, 5],
        [3, 4, 4, 5, 5, 5],
      ],
      solution: [
        { row: 0, col: 1 },
        { row: 1, col: 3 },
        { row: 2, col: 5 },
        { row: 3, col: 0 },
        { row: 4, col: 2 },
        { row: 5, col: 4 },
      ],
    },
  ],
  medium: [
    {
      size: 8,
      targetQueens: 8,
      // Exactly 8 distinct color regions (0 to 7) on 8x8 grid
      regions: [
        [0, 0, 0, 1, 1, 1, 2, 2],
        [0, 0, 0, 1, 1, 1, 2, 2],
        [3, 0, 0, 4, 4, 1, 2, 2],
        [3, 3, 4, 4, 4, 5, 5, 2],
        [3, 3, 4, 4, 5, 5, 5, 5],
        [6, 3, 7, 7, 5, 5, 5, 5],
        [6, 6, 7, 7, 7, 7, 5, 5],
        [6, 6, 6, 7, 7, 7, 7, 7],
      ],
      solution: [
        { row: 0, col: 2 },
        { row: 1, col: 5 },
        { row: 2, col: 7 },
        { row: 3, col: 0 },
        { row: 4, col: 3 },
        { row: 5, col: 6 },
        { row: 6, col: 1 },
        { row: 7, col: 4 },
      ],
    },
    {
      size: 8,
      targetQueens: 8,
      regions: [
        [0, 0, 0, 1, 1, 1, 2, 2],
        [0, 0, 0, 1, 1, 1, 2, 2],
        [3, 0, 0, 4, 4, 1, 2, 2],
        [3, 3, 4, 4, 4, 5, 5, 2],
        [3, 3, 4, 4, 5, 5, 5, 5],
        [6, 3, 7, 7, 5, 5, 5, 5],
        [6, 6, 7, 7, 7, 7, 5, 5],
        [6, 6, 6, 7, 7, 7, 7, 7],
      ],
      solution: [
        { row: 0, col: 2 },
        { row: 1, col: 5 },
        { row: 2, col: 7 },
        { row: 3, col: 0 },
        { row: 4, col: 3 },
        { row: 5, col: 6 },
        { row: 6, col: 1 },
        { row: 7, col: 4 },
      ],
    },
  ],
  hard: [
    {
      size: 9,
      targetQueens: 9,
      // 9 color regions on a 9x9 board for expert cognitive challenge
      regions: [
        [0, 0, 0, 1, 1, 2, 2, 2, 3],
        [0, 0, 1, 1, 1, 2, 2, 3, 3],
        [4, 0, 1, 1, 2, 2, 3, 3, 3],
        [4, 4, 5, 1, 2, 6, 3, 3, 3],
        [4, 4, 5, 5, 6, 6, 7, 7, 8],
        [4, 5, 5, 5, 6, 6, 7, 7, 8],
        [4, 5, 5, 6, 6, 6, 7, 7, 8],
        [4, 5, 6, 6, 7, 7, 7, 7, 8],
        [4, 6, 6, 7, 7, 7, 8, 8, 8],
      ],
      solution: [
        { row: 0, col: 1 },
        { row: 1, col: 3 },
        { row: 2, col: 5 },
        { row: 3, col: 7 },
        { row: 4, col: 0 },
        { row: 5, col: 2 },
        { row: 6, col: 4 },
        { row: 7, col: 6 },
        { row: 8, col: 8 },
      ],
    },
  ],
};

// Simple deterministic PRNG from seed
function createPseudoRandom(seed) {
  let s = 0;
  const str = String(seed || "hirequest_queens");
  for (let i = 0; i < str.length; i++) {
    s = (s * 31 + str.charCodeAt(i)) >>> 0;
  }
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function generateNQueens({ seed = "queens_default", difficulty = "medium" } = {}) {
  const prng = createPseudoRandom(seed);
  const diff = String(difficulty || "medium").toLowerCase();

  const puzzleList =
    LINKEDIN_QUEENS_PUZZLES[diff] ||
    LINKEDIN_QUEENS_PUZZLES.medium ||
    LINKEDIN_QUEENS_PUZZLES.easy;

  const idx = Math.floor(prng() * puzzleList.length);
  const chosen = puzzleList[idx] || puzzleList[0];

  return {
    type: "n-queens",
    size: chosen.size,
    targetQueens: chosen.targetQueens,
    difficulty: diff,
    regions: chosen.regions,
    // INITIAL STATE IS 100% EMPTY (no crowns pre-filled at all)
    initial: [],
    solution: chosen.solution,
    rules: "Place exactly one Queen (👑) in each row, column, and color region. No two queens can touch each other, not even diagonally.",
  };
}

function verifyNQueens(candidateSolution, puzzle) {
  if (!puzzle || typeof puzzle !== "object") {
    return { valid: false, error: "Puzzle definition is required." };
  }

  const size = Number(puzzle.size || puzzle.targetQueens || 8);
  const regions = puzzle.regions || [];

  let queens = [];
  if (Array.isArray(candidateSolution)) {
    queens = candidateSolution;
  } else if (candidateSolution && Array.isArray(candidateSolution.queens)) {
    queens = candidateSolution.queens;
  } else if (candidateSolution && typeof candidateSolution === "object") {
    queens = Object.entries(candidateSolution)
      .filter(([, val]) => val === "Q" || val === true || val === "crown")
      .map(([key]) => {
        const [r, c] = key.split(",").map(Number);
        return { row: r, col: c };
      });
  }

  if (queens.length !== size) {
    return {
      valid: false,
      error: `Expected ${size} queens, but placed ${queens.length}.`,
    };
  }

  const rowsSeen = new Set();
  const colsSeen = new Set();
  const regionsSeen = new Set();

  for (let i = 0; i < queens.length; i++) {
    const q1 = queens[i];
    const r1 = Number(q1.row);
    const c1 = Number(q1.col);

    if (isNaN(r1) || isNaN(c1) || r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) {
      return {
        valid: false,
        error: `Queen coordinates out of bounds at (${r1}, ${c1}).`,
      };
    }

    // Constraint 1: One queen per row
    if (rowsSeen.has(r1)) {
      return {
        valid: false,
        error: `Multiple queens placed on row ${r1 + 1}.`,
      };
    }
    rowsSeen.add(r1);

    // Constraint 2: One queen per column
    if (colsSeen.has(c1)) {
      return {
        valid: false,
        error: `Multiple queens placed on column ${c1 + 1}.`,
      };
    }
    colsSeen.add(c1);

    // Constraint 3: One queen per color region
    if (Array.isArray(regions) && regions[r1] && regions[r1][c1] !== undefined) {
      const regId = regions[r1][c1];
      if (regionsSeen.has(regId)) {
        return {
          valid: false,
          error: `Multiple queens placed in the same color region (Region ${regId + 1}).`,
        };
      }
      regionsSeen.add(regId);
    }

    // Constraint 4: No two queens can touch each other (not even diagonally: Chebyshev dist <= 1)
    for (let j = i + 1; j < queens.length; j++) {
      const q2 = queens[j];
      const r2 = Number(q2.row);
      const c2 = Number(q2.col);

      const dRow = Math.abs(r1 - r2);
      const dCol = Math.abs(c1 - c2);

      if (dRow <= 1 && dCol <= 1) {
        return {
          valid: false,
          error: `Queens are touching each other at (${r1 + 1}, ${c1 + 1}) and (${r2 + 1}, ${c2 + 1}).`,
        };
      }
    }
  }

  return { valid: true };
}

module.exports = {
  generateNQueens,
  verifyNQueens,
  LINKEDIN_QUEENS_PUZZLES,
};
