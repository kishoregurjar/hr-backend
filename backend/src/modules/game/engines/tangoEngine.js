"use strict";

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function generateTangoSolution(gridSize) {
  const half = Math.floor(gridSize / 2);
  const solution = Array.from({ length: gridSize }, () => Array(gridSize).fill(""));
  const rowCounts = Array.from({ length: gridSize }, () => ({ X: 0, O: 0 }));
  const colCounts = Array.from({ length: gridSize }, () => ({ X: 0, O: 0 }));

  function canPlace(row, col, symbol) {
    const rowState = rowCounts[row];
    const colState = colCounts[col];

    if (rowState[symbol] >= half || colState[symbol] >= half) return false;

    if (col >= 2 && solution[row][col - 1] === symbol && solution[row][col - 2] === symbol) return false;
    if (row >= 2 && solution[row - 1][col] === symbol && solution[row - 2][col] === symbol) return false;

    const rowRemaining = gridSize - (rowCounts[row].X + rowCounts[row].O);
    const colRemaining = gridSize - (colCounts[col].X + colCounts[col].O);

    const nextRowCount = rowState[symbol] + 1;
    const nextColCount = colState[symbol] + 1;
    if (half - nextRowCount > rowRemaining - 1) return false;
    if (half - nextColCount > colRemaining - 1) return false;

    return true;
  }

  function backtrack(index = 0) {
    if (index === gridSize * gridSize) {
      return (
        rowCounts.every((row) => row.X === half && row.O === half) &&
        colCounts.every((col) => col.X === half && col.O === half)
      );
    }

    const row = Math.floor(index / gridSize);
    const col = index % gridSize;
    const symbols = shuffle(["X", "O"]);

    for (const symbol of symbols) {
      if (!canPlace(row, col, symbol)) continue;

      solution[row][col] = symbol;
      rowCounts[row][symbol] += 1;
      colCounts[col][symbol] += 1;

      if (backtrack(index + 1)) return true;

      solution[row][col] = "";
      rowCounts[row][symbol] -= 1;
      colCounts[col][symbol] -= 1;
    }

    return false;
  }

  if (!backtrack()) {
    return [
      ["X", "X", "O", "O", "X", "O"],
      ["O", "X", "X", "O", "O", "X"],
      ["X", "O", "O", "X", "X", "O"],
      ["O", "O", "X", "X", "O", "X"],
      ["X", "O", "X", "O", "X", "O"],
      ["O", "X", "O", "X", "O", "X"],
    ];
  }

  return solution;
}

function generateTango(config = {}) {
  const size = 6;
  const difficulty = String(config.difficulty || "medium");
  const solution = generateTangoSolution(size);

  const allCells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      allCells.push({ row: r, col: c });
    }
  }

  const clueTarget = difficulty === "easy" ? 16 : difficulty === "hard" ? 10 : 12;
  const initial = {};
  shuffle([...allCells]).slice(0, clueTarget).forEach(({ row, col }) => {
    initial[`${row}-${col}`] = solution[row][col];
  });

  const adjacentPairs = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (c + 1 < size) {
        adjacentPairs.push({
          a: `${r}-${c}`,
          b: `${r}-${c + 1}`,
          type: solution[r][c] === solution[r][c + 1] ? "equal" : "not-equal",
        });
      }
      if (r + 1 < size) {
        adjacentPairs.push({
          a: `${r}-${c}`,
          b: `${r + 1}-${c}`,
          type: solution[r][c] === solution[r + 1][c] ? "equal" : "not-equal",
        });
      }
    }
  }

  const constraintTarget = difficulty === "easy" ? 12 : difficulty === "hard" ? 6 : 8;
  const constraints = shuffle(adjacentPairs).slice(0, constraintTarget);

  return {
    type: "tango",
    size,
    initial,
    constraints,
    solution,
    rules: "Fill with sun (O) and moon (X) symbols. Max 3 of each per row/col. No 3 consecutive same symbols. Adhere to equal (=) and not-equal (x) constraints.",
  };
}

function verifyTango(candidateGrid, gameData) {
  if (!candidateGrid || typeof candidateGrid !== "object" || !gameData) {
    return { valid: false, error: "Invalid solution format" };
  }

  const size = gameData.size || 6;
  const half = Math.floor(size / 2);

  for (let r = 0; r < size; r++) {
    let xCount = 0;
    let oCount = 0;
    for (let c = 0; c < size; c++) {
      const val = candidateGrid[`${r}-${c}`];
      if (val === "X") xCount++;
      else if (val === "O") oCount++;
      else return { valid: false, error: `Incomplete grid at row ${r + 1}, col ${c + 1}` };

      if (c >= 2) {
        const v1 = candidateGrid[`${r}-${c - 2}`];
        const v2 = candidateGrid[`${r}-${c - 1}`];
        const v3 = candidateGrid[`${r}-${c}`];
        if (v1 && v1 === v2 && v2 === v3) {
          return { valid: false, error: `3 consecutive ${v1} in row ${r + 1}` };
        }
      }
    }
    if (xCount !== half || oCount !== half) {
      return { valid: false, error: `Row ${r + 1} must have exactly ${half} suns and ${half} moons` };
    }
  }

  for (let c = 0; c < size; c++) {
    let xCount = 0;
    let oCount = 0;
    for (let r = 0; r < size; r++) {
      const val = candidateGrid[`${r}-${c}`];
      if (val === "X") xCount++;
      else if (val === "O") oCount++;

      if (r >= 2) {
        const v1 = candidateGrid[`${r - 2}-${c}`];
        const v2 = candidateGrid[`${r - 1}-${c}`];
        const v3 = candidateGrid[`${r}-${c}`];
        if (v1 && v1 === v2 && v2 === v3) {
          return { valid: false, error: `3 consecutive ${v1} in column ${c + 1}` };
        }
      }
    }
    if (xCount !== half || oCount !== half) {
      return { valid: false, error: `Column ${c + 1} must have exactly ${half} suns and ${half} moons` };
    }
  }

  const constraints = gameData.constraints || [];
  for (const rule of constraints) {
    const vA = candidateGrid[rule.a];
    const vB = candidateGrid[rule.b];
    if (!vA || !vB) continue;

    if (rule.type === "equal" && vA !== vB) {
      return { valid: false, error: `Equal constraint violated between ${rule.a} and ${rule.b}` };
    }
    if (rule.type === "not-equal" && vA === vB) {
      return { valid: false, error: `Not-equal constraint violated between ${rule.a} and ${rule.b}` };
    }
  }

  return { valid: true };
}

module.exports = {
  generateTango,
  verifyTango,
};
