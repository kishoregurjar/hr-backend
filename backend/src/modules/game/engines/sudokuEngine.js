"use strict";

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function transformSudokuBoard(baseBoard) {
  const size = baseBoard.length;
  let board = baseBoard.map((row) => row.slice());

  // Random digit permutation (1-6)
  const digits = shuffle([1, 2, 3, 4, 5, 6]);
  const map = {};
  for (let i = 1; i <= size; i++) map[i] = digits[i - 1];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      board[r][c] = map[board[r][c]];
    }
  }

  // Swap rows within 2-row bands
  for (let band = 0; band < 3; band++) {
    if (Math.random() < 0.5) {
      const r1 = band * 2;
      const r2 = band * 2 + 1;
      const tmp = board[r1];
      board[r1] = board[r2];
      board[r2] = tmp;
    }
  }

  return board;
}

function countSudokuSolutions(puzzle, limit = 2) {
  const size = puzzle.length;
  const blockH = 2;
  const blockW = 3;

  const rows = Array.from({ length: size }, () => new Set());
  const cols = Array.from({ length: size }, () => new Set());
  const blocks = Array.from({ length: size }, () => new Set());
  const empties = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = puzzle[r][c];
      if (!v || v === 0) {
        empties.push([r, c]);
      } else {
        rows[r].add(v);
        cols[c].add(v);
        const bi = Math.floor(r / blockH) * (size / blockW) + Math.floor(c / blockW);
        blocks[bi].add(v);
      }
    }
  }

  let count = 0;

  function backtrack(idx) {
    if (count >= limit) return;
    if (idx === empties.length) {
      count += 1;
      return;
    }

    const [r, c] = empties[idx];
    const bi = Math.floor(r / blockH) * (size / blockW) + Math.floor(c / blockW);

    for (let num = 1; num <= size; num++) {
      if (rows[r].has(num) || cols[c].has(num) || blocks[bi].has(num)) continue;

      rows[r].add(num);
      cols[c].add(num);
      blocks[bi].add(num);

      backtrack(idx + 1);

      blocks[bi].delete(num);
      cols[c].delete(num);
      rows[r].delete(num);

      if (count >= limit) return;
    }
  }

  backtrack(0);
  return count;
}

function generatePuzzleFromSolution(solution, difficulty) {
  const size = solution.length;
  const targetClues = difficulty === "easy" ? 22 : difficulty === "hard" ? 14 : 18;
  const puzzle = solution.map((r) => r.slice());

  const allPositions = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) allPositions.push([r, c]);
  }

  shuffle(allPositions);

  let currentClues = size * size;
  for (const [r, c] of allPositions) {
    if (currentClues <= targetClues) break;

    const backup = puzzle[r][c];
    puzzle[r][c] = 0;

    const sols = countSudokuSolutions(puzzle, 2);
    if (sols === 1) {
      currentClues -= 1;
    } else {
      puzzle[r][c] = backup;
    }
  }

  return puzzle;
}

function generateSudoku(config = {}) {
  const difficulty = String(config.difficulty || "medium");

  const baseSolution = [
    [5, 1, 2, 4, 6, 3],
    [6, 3, 4, 1, 2, 5],
    [2, 4, 5, 6, 3, 1],
    [3, 6, 1, 2, 5, 4],
    [4, 5, 6, 3, 1, 2],
    [1, 2, 3, 5, 4, 6],
  ];

  const solution = transformSudokuBoard(baseSolution);
  const puzzle = generatePuzzleFromSolution(solution, difficulty);

  return {
    type: "sudoku",
    size: 6,
    boxRows: 2,
    boxCols: 3,
    puzzle,
    initialBoard: puzzle,
    solution,
    difficulty,
  };
}

function verifySudoku(candidateBoard, _gameData) {
  if (!Array.isArray(candidateBoard) || candidateBoard.length !== 6) {
    return { valid: false, error: "Candidate board must be a 6x6 array" };
  }

  const size = 6;
  const boxRows = 2;
  const boxCols = 3;

  for (let r = 0; r < size; r++) {
    const rowSet = new Set();
    for (let c = 0; c < size; c++) {
      const val = Number(candidateBoard[r][c]);
      if (!val || val < 1 || val > 6) {
        return { valid: false, error: `Incomplete cell at row ${r + 1}, col ${c + 1}` };
      }
      if (rowSet.has(val)) {
        return { valid: false, error: `Duplicate number ${val} in row ${r + 1}` };
      }
      rowSet.add(val);
    }
  }

  for (let c = 0; c < size; c++) {
    const colSet = new Set();
    for (let r = 0; r < size; r++) {
      const val = Number(candidateBoard[r][c]);
      if (colSet.has(val)) {
        return { valid: false, error: `Duplicate number ${val} in column ${c + 1}` };
      }
      colSet.add(val);
    }
  }

  for (let br = 0; br < size; br += boxRows) {
    for (let bc = 0; bc < size; bc += boxCols) {
      const boxSet = new Set();
      for (let r = br; r < br + boxRows; r++) {
        for (let c = bc; c < bc + boxCols; c++) {
          const val = Number(candidateBoard[r][c]);
          if (boxSet.has(val)) {
            return { valid: false, error: `Duplicate number ${val} in 2x3 block` };
          }
          boxSet.add(val);
        }
      }
    }
  }

  return { valid: true };
}

module.exports = {
  generateSudoku,
  verifySudoku,
};
