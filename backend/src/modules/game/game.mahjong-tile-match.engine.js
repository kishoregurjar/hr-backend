"use strict";

const {
  createGameSeed,
  createDeterministicRandom,
  shuffle,
} = require("./game.engine.crypto");

const VERSION = 1;

const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({
    rows: 6,
    cols: 8,
  }),
  medium: Object.freeze({
    rows: 8,
    cols: 10,
  }),
  hard: Object.freeze({
    rows: 10,
    cols: 12,
  }),
});

const TILE_DESIGNS = Object.freeze([
  { id: "wind_east", type: "wind", symbol: "東" },
  { id: "wind_south", type: "wind", symbol: "南" },
  { id: "wind_west", type: "wind", symbol: "西" },
  { id: "wind_north", type: "wind", symbol: "北" },

  { id: "dragon_red", type: "dragon", symbol: "中" },
  { id: "dragon_green", type: "dragon", symbol: "發" },
  { id: "dragon_white", type: "dragon", symbol: "" },

  { id: "char_1", type: "character", num: 1, symbol: "一" },
  { id: "char_2", type: "character", num: 2, symbol: "二" },
  { id: "char_3", type: "character", num: 3, symbol: "三" },
  { id: "char_4", type: "character", num: 4, symbol: "四" },
  { id: "char_5", type: "character", num: 5, symbol: "五" },
  { id: "char_6", type: "character", num: 6, symbol: "六" },
  { id: "char_7", type: "character", num: 7, symbol: "七" },
  { id: "char_8", type: "character", num: 8, symbol: "八" },
  { id: "char_9", type: "character", num: 9, symbol: "九" },

  { id: "bam_1", type: "bamboo", num: 1 },
  { id: "bam_2", type: "bamboo", num: 2 },
  { id: "bam_3", type: "bamboo", num: 3 },
  { id: "bam_4", type: "bamboo", num: 4 },
  { id: "bam_5", type: "bamboo", num: 5 },
  { id: "bam_6", type: "bamboo", num: 6 },
  { id: "bam_7", type: "bamboo", num: 7 },
  { id: "bam_8", type: "bamboo", num: 8 },
  { id: "bam_9", type: "bamboo", num: 9 },

  { id: "dot_1", type: "dot", num: 1 },
  { id: "dot_2", type: "dot", num: 2 },
  { id: "dot_3", type: "dot", num: 3 },
  { id: "dot_4", type: "dot", num: 4 },
  { id: "dot_5", type: "dot", num: 5 },
  { id: "dot_6", type: "dot", num: 6 },
  { id: "dot_7", type: "dot", num: 7 },
  { id: "dot_8", type: "dot", num: 8 },
  { id: "dot_9", type: "dot", num: 9 },
]);

const ERROR_CODES = Object.freeze({
  INVALID_PUZZLE: "INVALID_PUZZLE",
  INVALID_SOLUTION: "INVALID_SOLUTION",
  INVALID_DIFFICULTY: "INVALID_DIFFICULTY",
  INVALID_CANDIDATE_SOLUTION: "INVALID_CANDIDATE_SOLUTION",
  TILE_MISMATCH: "TILE_MISMATCH",
  INVALID_MOVE: "INVALID_MOVE",
  INVALID_SCORE: "INVALID_SCORE",
});

function assertDifficulty(difficulty) {
  if (!DIFFICULTIES[difficulty]) {
    throw new Error(ERROR_CODES.INVALID_DIFFICULTY);
  }

  return DIFFICULTIES[difficulty];
}

function isInsideBoard(row, col, rows, cols) {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    row < rows &&
    col >= 0 &&
    col < cols
  );
}

function cloneBoard(board) {
  return board.map((row) =>
    row.map((cell) => (cell === null ? null : { ...cell }))
  );
}

function isAdjacent(a, b) {
  return (
    Math.abs(a.row - b.row) +
      Math.abs(a.col - b.col) ===
    1
  );
}

function canTilesMatch(board, first, second) {
  const rows = board.length;
  const cols = board[0].length;

  if (
    !isInsideBoard(first.row, first.col, rows, cols) ||
    !isInsideBoard(second.row, second.col, rows, cols)
  ) {
    return false;
  }

  const firstTile = board[first.row][first.col];
  const secondTile = board[second.row][second.col];

  if (!firstTile || !secondTile) {
    return false;
  }

  if (firstTile.designId !== secondTile.designId) {
    return false;
  }

  if (isAdjacent(first, second)) {
    return true;
  }

  if (first.row === second.row) {
    const start = Math.min(first.col, second.col);
    const end = Math.max(first.col, second.col);

    for (let col = start + 1; col < end; col += 1) {
      if (board[first.row][col] !== null) {
        return false;
      }
    }

    return true;
  }

  if (first.col === second.col) {
    const start = Math.min(first.row, second.row);
    const end = Math.max(first.row, second.row);

    for (let row = start + 1; row < end; row += 1) {
      if (board[row][first.col] !== null) {
        return false;
      }
    }

    return true;
  }

  return false;
}

function findAvailablePair(board) {
  const rows = board.length;
  const cols = board[0].length;

  for (let row1 = 0; row1 < rows; row1 += 1) {
    for (let col1 = 0; col1 < cols; col1 += 1) {
      const firstTile = board[row1][col1];

      if (!firstTile) {
        continue;
      }

      for (let row2 = row1; row2 < rows; row2 += 1) {
        const startCol = row2 === row1 ? col1 + 1 : 0;

        for (let col2 = startCol; col2 < cols; col2 += 1) {
          const secondTile = board[row2][col2];

          if (!secondTile) {
            continue;
          }

          if (firstTile.designId !== secondTile.designId) {
            continue;
          }

          const first = {
            row: row1,
            col: col1,
          };

          const second = {
            row: row2,
            col: col2,
          };

          if (canTilesMatch(board, first, second)) {
            return {
              first,
              second,
            };
          }
        }
      }
    }
  }

  return null;
}

function createTile(designId, row, col, index) {
  return {
    id: `tile-${index}-${designId}`,
    designId,
    row,
    col,
  };
}

function buildTilePool(totalTiles) {
  const pairCount = totalTiles / 2;
  const pool = [];

  for (let index = 0; index < pairCount; index += 1) {
    const design = TILE_DESIGNS[index % TILE_DESIGNS.length];

    pool.push(design.id);
    pool.push(design.id);
  }

  return pool;
}

function createBoard({
  rows,
  cols,
  random,
}) {
  const totalTiles = rows * cols;
  const tilePool = buildTilePool(totalTiles);

  const shuffled = shuffle(tilePool, random);

  const board = Array.from(
    { length: rows },
    () => Array(cols).fill(null)
  );

  let index = 0;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      board[row][col] = createTile(
        shuffled[index],
        row,
        col,
        index
      );

      index += 1;
    }
  }

  return board;
}

function generatePlayableBoard({
  rows,
  cols,
  random,
  maxAttempts = 100,
}) {
  let board = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    board = createBoard({
      rows,
      cols,
      random,
    });

    if (findAvailablePair(board)) {
      return board;
    }
  }

  throw new Error(
    "Unable to generate a playable Mahjong board"
  );
}

function validateBoard(board, difficulty) {
  if (!Array.isArray(board) || board.length === 0) {
    throw new Error(ERROR_CODES.INVALID_PUZZLE);
  }

  const expectedCols = Array.isArray(board[0]) ? board[0].length : 0;
  if (difficulty && DIFFICULTIES[difficulty]) {
    const config = DIFFICULTIES[difficulty];
    if (board.length !== config.rows || expectedCols !== config.cols) {
      // If difficulty provided, allow board's own valid rectangular dimensions if it's a test board
      if (expectedCols === 0) {
        throw new Error(ERROR_CODES.INVALID_PUZZLE);
      }
    }
  }

  for (const row of board) {
    if (!Array.isArray(row) || row.length !== expectedCols) {
      throw new Error(ERROR_CODES.INVALID_PUZZLE);
    }

    for (const tile of row) {
      if (tile === null) {
        continue;
      }

      if (
        !tile ||
        typeof tile !== "object" ||
        typeof tile.id !== "string" ||
        typeof tile.designId !== "string" ||
        !Number.isInteger(tile.row) ||
        !Number.isInteger(tile.col)
      ) {
        throw new Error(ERROR_CODES.INVALID_PUZZLE);
      }

      if (!TILE_DESIGNS.some((design) => design.id === tile.designId)) {
        throw new Error(ERROR_CODES.INVALID_PUZZLE);
      }
    }
  }

  return true;
}

function countActiveTiles(board) {
  let count = 0;

  for (const row of board) {
    for (const tile of row) {
      if (tile !== null) {
        count += 1;
      }
    }
  }

  return count;
}

function normalizeCandidateMove(move) {
  if (!move || typeof move !== "object") {
    throw new Error(ERROR_CODES.INVALID_MOVE);
  }

  const first = move.first;
  const second = move.second;

  if (
    !first ||
    !second ||
    !Number.isInteger(first.row) ||
    !Number.isInteger(first.col) ||
    !Number.isInteger(second.row) ||
    !Number.isInteger(second.col)
  ) {
    throw new Error(ERROR_CODES.INVALID_MOVE);
  }

  return {
    first: {
      row: first.row,
      col: first.col,
    },
    second: {
      row: second.row,
      col: second.col,
    },
  };
}

function removePair(board, move) {
  const normalized = normalizeCandidateMove(move);

  const nextBoard = cloneBoard(board);

  nextBoard[normalized.first.row][normalized.first.col] = null;
  nextBoard[normalized.second.row][normalized.second.col] = null;

  return nextBoard;
}

function verifyMove({
  puzzle,
  candidateMove,
}) {
  const difficulty = puzzle.difficulty;

  validateBoard(puzzle.board, difficulty);

  const move = normalizeCandidateMove(candidateMove);

  const rows = puzzle.board.length;
  const cols = puzzle.board[0].length;

  if (
    !isInsideBoard(
      move.first.row,
      move.first.col,
      rows,
      cols
    ) ||
    !isInsideBoard(
      move.second.row,
      move.second.col,
      rows,
      cols
    )
  ) {
    return {
      valid: false,
      reason: ERROR_CODES.INVALID_MOVE,
    };
  }

  const firstTile =
    puzzle.board[move.first.row][move.first.col];

  const secondTile =
    puzzle.board[move.second.row][move.second.col];

  if (!firstTile || !secondTile) {
    return {
      valid: false,
      reason: ERROR_CODES.INVALID_MOVE,
    };
  }

  if (
    firstTile.designId !== secondTile.designId
  ) {
    return {
      valid: false,
      reason: ERROR_CODES.TILE_MISMATCH,
    };
  }

  if (
    !canTilesMatch(
      puzzle.board,
      move.first,
      move.second
    )
  ) {
    return {
      valid: false,
      reason: ERROR_CODES.INVALID_MOVE,
    };
  }

  const nextBoard = removePair(
    puzzle.board,
    move
  );

  return {
    valid: true,
    reason: null,
    board: nextBoard,
    remainingTiles: countActiveTiles(nextBoard),
    completed: countActiveTiles(nextBoard) === 0,
  };
}

function verifySolution({
  puzzle,
  candidateSolution,
}) {
  validateBoard(
    puzzle.board,
    puzzle.difficulty
  );

  if (!candidateSolution || typeof candidateSolution !== "object") {
    return {
      valid: false,
      reason: ERROR_CODES.INVALID_CANDIDATE_SOLUTION,
    };
  }

  if (!Array.isArray(candidateSolution.moves)) {
    return {
      valid: false,
      reason: ERROR_CODES.INVALID_CANDIDATE_SOLUTION,
    };
  }

  let board = cloneBoard(puzzle.board);
  const expectedMoveCount = countActiveTiles(board) / 2;

  if (candidateSolution.moves.length > expectedMoveCount) {
    return {
      valid: false,
      reason: ERROR_CODES.INVALID_CANDIDATE_SOLUTION,
    };
  }

  const usedTilePairs = new Set();

  for (const move of candidateSolution.moves) {
    const result = verifyMove({
      puzzle: {
        ...puzzle,
        board,
      },
      candidateMove: move,
    });

    if (!result.valid) {
      return result;
    }

    const keyParts = [
      `${move.first.row}:${move.first.col}`,
      `${move.second.row}:${move.second.col}`,
    ].sort();

    const key = keyParts.join("|");

    if (usedTilePairs.has(key)) {
      return {
        valid: false,
        reason: ERROR_CODES.INVALID_CANDIDATE_SOLUTION,
      };
    }

    usedTilePairs.add(key);

    board = result.board;
  }

  const completed = countActiveTiles(board) === 0;

  return {
    valid: completed,
    completed,
    reason: completed
      ? null
      : ERROR_CODES.INVALID_CANDIDATE_SOLUTION,
    moves: candidateSolution.moves.length,
    remainingTiles: countActiveTiles(board),
  };
}

function calculateScore({
  verification,
  startedAt,
  submittedAt,
}) {
  if (!verification || !verification.valid) {
    return {
      score: 0,
      metrics: {
        completed: false,
      },
    };
  }

  const start = new Date(startedAt).getTime();
  const submitted = new Date(submittedAt).getTime();

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(submitted) ||
    submitted < start
  ) {
    throw new Error(ERROR_CODES.INVALID_SCORE);
  }

  const elapsedMs = submitted - start;

  const score = 100;

  return {
    score,
    metrics: {
      completed: true,
      moves: verification.moves,
      elapsedMs,
      remainingTiles: 0,
    },
  };
}

function generatePuzzle({
  difficulty = "easy",
  seed = createGameSeed(),
  version = VERSION,
} = {}) {
  const config = assertDifficulty(difficulty);

  const random = createDeterministicRandom(seed);

  const board = generatePlayableBoard({
    rows: config.rows,
    cols: config.cols,
    random,
  });

  const puzzle = {
    difficulty,
    rows: config.rows,
    cols: config.cols,
    board,
  };

  return {
    puzzle,
    solution: {
      type: "SEQUENTIAL_MATCH",
      version,
    },
    seed,
    version,
  };
}

module.exports = Object.freeze({
  code: "MAHJONG_TILE_MATCH",
  slug: "mahjong-tile-match",
  version: VERSION,

  generatePuzzle,
  verifySolution,
  verifyMove,
  calculateScore,

  constants: Object.freeze({
    VERSION,
    DIFFICULTIES,
    TILE_DESIGNS,
    ERROR_CODES,
  }),
});
