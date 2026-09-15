"use strict";

const {
  GAME_ENGINE_CONSTANTS,
} = require("./game.engine.constants");

const {
  createGameSeed,
  createDeterministicRandom,
  shuffle,
} = require("./game.engine.crypto");

const SIZE = 6;
const BOX_ROWS = 2;
const BOX_COLS = 3;
const MAX_ATTEMPTS = 200;

const EMPTY = 0;

const SCORE = Object.freeze({
  COMPLETED: 100,
  FAILED: 0,
});

const BASE_GRID = Object.freeze([
  Object.freeze([1, 2, 3, 4, 5, 6]),
  Object.freeze([4, 5, 6, 1, 2, 3]),
  Object.freeze([2, 3, 4, 5, 6, 1]),
  Object.freeze([5, 6, 1, 2, 3, 4]),
  Object.freeze([3, 4, 5, 6, 1, 2]),
  Object.freeze([6, 1, 2, 3, 4, 5]),
]);

function cloneBoard(board) {
  return board.map((row) => [...row]);
}

function isValidDimension(board) {
  return (
    Array.isArray(board) &&
    board.length === SIZE &&
    board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === SIZE
    )
  );
}

function isValidCellValue(value) {
  return (
    Number.isInteger(value) &&
    value >= EMPTY &&
    value <= SIZE
  );
}

function validateBoardShape(board) {
  if (!isValidDimension(board)) {
    return false;
  }

  return board.every((row) =>
    row.every(isValidCellValue)
  );
}

function getBoxStart(row, col) {
  return {
    row: Math.floor(row / BOX_ROWS) * BOX_ROWS,
    col: Math.floor(col / BOX_COLS) * BOX_COLS,
  };
}

function isPlacementValid(board, row, col, value) {
  if (
    row < 0 ||
    row >= SIZE ||
    col < 0 ||
    col >= SIZE ||
    value < 1 ||
    value > SIZE
  ) {
    return false;
  }

  for (let index = 0; index < SIZE; index += 1) {
    if (index !== col && board[row][index] === value) {
      return false;
    }

    if (index !== row && board[index][col] === value) {
      return false;
    }
  }

  const {
    row: boxRow,
    col: boxCol,
  } = getBoxStart(row, col);

  for (
    let currentRow = boxRow;
    currentRow < boxRow + BOX_ROWS;
    currentRow += 1
  ) {
    for (
      let currentCol = boxCol;
      currentCol < boxCol + BOX_COLS;
      currentCol += 1
    ) {
      if (
        (currentRow !== row || currentCol !== col) &&
        board[currentRow][currentCol] === value
      ) {
        return false;
      }
    }
  }

  return true;
}

function findEmptyCell(board) {
  let bestCell = null;
  let bestCandidates = null;

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col] !== EMPTY) {
        continue;
      }

      const candidates = [];

      for (let value = 1; value <= SIZE; value += 1) {
        if (isPlacementValid(board, row, col, value)) {
          candidates.push(value);
        }
      }

      if (candidates.length === 0) {
        return {
          row,
          col,
          candidates: [],
        };
      }

      if (
        bestCandidates === null ||
        candidates.length < bestCandidates.length
      ) {
        bestCell = {
          row,
          col,
        };

        bestCandidates = candidates;

        if (candidates.length === 1) {
          return {
            ...bestCell,
            candidates: bestCandidates,
          };
        }
      }
    }
  }

  if (!bestCell) {
    return null;
  }

  return {
    ...bestCell,
    candidates: bestCandidates,
  };
}

function countSolutions(board, limit = 2) {
  const cell = findEmptyCell(board);

  if (!cell) {
    return 1;
  }

  if (cell.candidates.length === 0) {
    return 0;
  }

  let count = 0;

  for (const value of cell.candidates) {
    board[cell.row][cell.col] = value;

    count += countSolutions(board, limit - count);

    board[cell.row][cell.col] = EMPTY;

    if (count >= limit) {
      return count;
    }
  }

  return count;
}

function solveBoard(board, random = Math.random) {
  const cell = findEmptyCell(board);

  if (!cell) {
    return true;
  }

  if (cell.candidates.length === 0) {
    return false;
  }

  const candidates = shuffle(
    cell.candidates,
    random
  );

  for (const value of candidates) {
    board[cell.row][cell.col] = value;

    if (solveBoard(board, random)) {
      return true;
    }

    board[cell.row][cell.col] = EMPTY;
  }

  return false;
}

function generateSolvedBoard(random) {
  const board = cloneBoard(BASE_GRID);

  const symbols = shuffle(
    [1, 2, 3, 4, 5, 6],
    random
  );

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      board[row][col] = symbols[board[row][col] - 1];
    }
  }

  const rowBands = [
    [0, 1],
    [2, 3],
    [4, 5],
  ];

  for (const band of rowBands) {
    if (random() >= 0.5) {
      [board[band[0]], board[band[1]]] = [
        board[band[1]],
        board[band[0]],
      ];
    }
  }

  const bandOrder = shuffle(
    [0, 1, 2],
    random
  );

  const reorderedRows = [];

  for (const bandIndex of bandOrder) {
    reorderedRows.push(
      board[bandIndex * BOX_ROWS],
      board[bandIndex * BOX_ROWS + 1]
    );
  }

  return reorderedRows;
}

function removeCellsWhileUnique(
  solvedBoard,
  random
) {
  const puzzle = cloneBoard(solvedBoard);

  const cells = [];

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      cells.push({ row, col });
    }
  }

  const shuffledCells = shuffle(
    cells,
    random
  );

  const TARGET_CLUES = 18;

  let clues = SIZE * SIZE;

  for (const cell of shuffledCells) {
    if (clues <= TARGET_CLUES) {
      break;
    }

    const previousValue =
      puzzle[cell.row][cell.col];

    puzzle[cell.row][cell.col] = EMPTY;

    const testBoard = cloneBoard(puzzle);

    const solutionCount = countSolutions(
      testBoard,
      2
    );

    if (solutionCount === 1) {
      clues -= 1;
    } else {
      puzzle[cell.row][cell.col] =
        previousValue;
    }
  }

  return puzzle;
}

function serializeBoard(board) {
  return JSON.stringify(board);
}

function validatePuzzle(puzzle) {
  if (
    !puzzle ||
    typeof puzzle !== "object"
  ) {
    return false;
  }

  if (!validateBoardShape(puzzle.board)) {
    return false;
  }

  if (!validateBoardShape(puzzle.givens)) {
    return false;
  }

  if (
    puzzle.size !== SIZE ||
    puzzle.boxRows !== BOX_ROWS ||
    puzzle.boxCols !== BOX_COLS
  ) {
    return false;
  }

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const given = puzzle.givens[row][col];
      const value = puzzle.board[row][col];

      if (given !== EMPTY && given !== value) {
        return false;
      }
    }
  }

  return true;
}

function validateSolutionBoard(
  candidateSolution
) {
  if (!validateBoardShape(candidateSolution)) {
    return false;
  }

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const value = candidateSolution[row][col];

      if (
        !isPlacementValid(
          candidateSolution,
          row,
          col,
          value
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

function boardsEqual(left, right) {
  if (
    !validateBoardShape(left) ||
    !validateBoardShape(right)
  ) {
    return false;
  }

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (left[row][col] !== right[row][col]) {
        return false;
      }
    }
  }

  return true;
}

function generatePuzzle({ seed, version } = {}) {
  const actualSeed =
    typeof seed === "string" && seed.length > 0
      ? seed
      : createGameSeed();

  const actualVersion =
    Number.isInteger(version) && version > 0
      ? version
      : GAME_ENGINE_CONSTANTS.VERSION;

  const random =
    createDeterministicRandom(actualSeed);

  for (
    let attempt = 0;
    attempt < MAX_ATTEMPTS;
    attempt += 1
  ) {
    const solvedBoard =
      generateSolvedBoard(random);

    const puzzleBoard =
      removeCellsWhileUnique(
        solvedBoard,
        random
      );

    const generatedPuzzle = {
      size: SIZE,
      boxRows: BOX_ROWS,
      boxCols: BOX_COLS,
      board: puzzleBoard,
      givens: cloneBoard(puzzleBoard),
    };

    if (!validatePuzzle(generatedPuzzle)) {
      continue;
    }

    const solution = cloneBoard(solvedBoard);

    return {
      puzzle: generatedPuzzle,
      solution,
      seed: actualSeed,
      version: actualVersion,
    };
  }

  throw new Error(
    "Unable to generate a valid Mini Sudoku puzzle"
  );
}

function verifySolution({
  puzzle,
  solution,
  candidateSolution,
}) {
  if (!validatePuzzle(puzzle)) {
    return {
      correct: false,
      reason: "INVALID_PUZZLE",
    };
  }

  if (!validateBoardShape(solution)) {
    return {
      correct: false,
      reason: "INVALID_SERVER_SOLUTION",
    };
  }

  if (
    !validateBoardShape(candidateSolution)
  ) {
    return {
      correct: false,
      reason: "INVALID_CANDIDATE_SOLUTION",
    };
  }

  if (
    !validateSolutionBoard(candidateSolution)
  ) {
    return {
      correct: false,
      reason: "INVALID_SUDOKU_SOLUTION",
    };
  }

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const given = puzzle.givens[row][col];

      if (
        given !== EMPTY &&
        candidateSolution[row][col] !== given
      ) {
        return {
          correct: false,
          reason: "GIVEN_CELL_MODIFIED",
        };
      }
    }
  }

  const correct = boardsEqual(
    candidateSolution,
    solution
  );

  return {
    correct,
    reason: correct
      ? "CORRECT"
      : "INCORRECT_SOLUTION",
  };
}

function calculateScore({
  verification,
  startedAt,
  submittedAt,
}) {
  if (
    !verification ||
    typeof verification.correct !== "boolean"
  ) {
    throw new TypeError(
      "Invalid game verification result"
    );
  }

  const start = startedAt instanceof Date ? startedAt : new Date(startedAt);
  const submitted = submittedAt instanceof Date ? submittedAt : new Date(submittedAt);

  if (
    isNaN(start.getTime()) ||
    isNaN(submitted.getTime())
  ) {
    throw new TypeError(
      "Invalid game timestamps"
    );
  }

  const elapsedMs =
    submitted.getTime() -
    start.getTime();

  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs < 0
  ) {
    throw new TypeError(
      "Invalid game elapsed time"
    );
  }

  const score = verification.correct
    ? SCORE.COMPLETED
    : SCORE.FAILED;

  return {
    score,
    metrics: {
      completed: verification.correct,
      elapsedMs,
    },
  };
}

module.exports = Object.freeze({
  version: GAME_ENGINE_CONSTANTS.VERSION,
  generatePuzzle,
  verifySolution,
  calculateScore,
});
