"use strict";

function makeRng(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rng = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function allCells(size) {
  const cells = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      cells.push(`${row}-${col}`);
    }
  }
  return cells;
}

function getNeighbors(cell, size) {
  const [row, col] = cell.split("-").map(Number);
  return [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ]
    .filter(([r, c]) => r >= 0 && r < size && c >= 0 && c < size)
    .map(([r, c]) => `${r}-${c}`);
}

function onwardDegree(cell, visited, size) {
  let degree = 0;
  for (const next of getNeighbors(cell, size)) {
    if (!visited.has(next)) degree += 1;
  }
  return degree;
}

function buildSnakePath(size) {
  const path = [];
  for (let row = size - 1; row >= 0; row--) {
    const cols =
      (size - 1 - row) % 2 === 0
        ? Array.from({ length: size }, (_, i) => i)
        : Array.from({ length: size }, (_, i) => size - 1 - i);

    for (const col of cols) {
      path.push(`${row}-${col}`);
    }
  }
  return path;
}

function generateHamiltonianPath(size, seed = 331680) {
  const total = size * size;
  const maxAttempts = 12;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rng = makeRng(seed + attempt * 97 + Math.floor(Math.random() * 1000));
    const starts = shuffle(allCells(size), rng);

    for (const start of starts.slice(0, 10)) {
      const path = [start];
      const visited = new Set(path);

      const walk = () => {
        if (path.length === total) return true;

        const current = path[path.length - 1];
        const options = getNeighbors(current, size).filter((cell) => !visited.has(cell));

        if (options.length === 0) return false;

        const ranked = options
          .map((cell) => ({
            cell,
            degree: onwardDegree(cell, visited, size),
            bias: rng(),
          }))
          .sort((a, b) => {
            if (a.degree !== b.degree) return a.degree - b.degree;
            return a.bias - b.bias;
          });

        for (const { cell } of ranked) {
          visited.add(cell);
          path.push(cell);
          if (walk()) return true;
          path.pop();
          visited.delete(cell);
        }

        return false;
      };

      if (walk()) return path;
    }
  }

  return buildSnakePath(size);
}

function getTurnIndexes(path) {
  const turns = [];
  for (let i = 1; i < path.length - 1; i++) {
    const [pr, pc] = path[i - 1].split("-").map(Number);
    const [cr, cc] = path[i].split("-").map(Number);
    const [nr, nc] = path[i + 1].split("-").map(Number);
    const prevDir = `${cr - pr},${cc - pc}`;
    const nextDir = `${nr - cr},${nc - cc}`;
    if (prevDir !== nextDir) turns.push(i);
  }
  return turns;
}

function buildClueIndexes(path, clueCount, rng) {
  const total = path.length;
  const selected = new Set([0, total - 1]);
  const turnIndexes = shuffle(getTurnIndexes(path), rng);

  for (const index of turnIndexes) {
    if (selected.size >= clueCount) break;
    selected.add(index);
  }

  const spacing = Math.max(3, Math.floor(total / Math.max(4, clueCount)));
  for (let index = spacing; index < total - 1 && selected.size < clueCount; index += spacing) {
    selected.add(index);
  }

  if (selected.size < clueCount) {
    const remaining = shuffle(
      Array.from({ length: total - 2 }, (_, index) => index + 1).filter((index) => !selected.has(index)),
      rng
    );

    for (const index of remaining) {
      if (selected.size >= clueCount) break;
      selected.add(index);
    }
  }

  return Array.from(selected).sort((a, b) => a - b);
}

function buildZipNumbers(path, clueCount, seed = 331680) {
  const numbers = {};
  for (const cell of path) numbers[cell] = " ";

  const rng = makeRng(seed ^ 0x51f15);
  const clueIndexes = buildClueIndexes(path, clueCount, rng);
  clueIndexes.forEach((index, clueNumber) => {
    numbers[path[index]] = clueNumber + 1;
  });

  return numbers;
}

function buildWalls(path, size, wallCount, seed = 764201) {
  const pathEdges = new Set();
  for (let i = 0; i < path.length - 1; i++) {
    pathEdges.add([path[i], path[i + 1]].sort().join("|"));
  }

  const allEdges = [];
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (row < size - 1) {
        allEdges.push([`${row}-${col}`, `${row + 1}-${col}`].sort().join("|"));
      }
      if (col < size - 1) {
        allEdges.push([`${row}-${col}`, `${row}-${col + 1}`].sort().join("|"));
      }
    }
  }

  const safeEdges = allEdges.filter((edge) => !pathEdges.has(edge));
  return shuffle(safeEdges, makeRng(seed)).slice(0, wallCount);
}

function generateZip(config = {}) {
  const size = Math.min(8, Math.max(4, Number(config.gridSize) || 8));
  const clueCount = Math.min(15, Math.max(8, Number(config.clueCount) || 11));
  const wallCount = Number(config.wallCount) || (size === 8 ? 24 : 12);
  const seed = Math.floor(Math.random() * 1000000) + 1;

  const solutionPath = generateHamiltonianPath(size, seed);
  const numbers = buildZipNumbers(solutionPath, clueCount, seed);
  const walls = buildWalls(solutionPath, size, wallCount, seed + 13);

  return {
    type: "zip",
    size,
    numbers,
    solutionPath,
    targetNumber: clueCount,
    walls,
  };
}

function verifyZip(candidatePath, gameData) {
  if (!Array.isArray(candidatePath) || !gameData) {
    return { valid: false, error: "Invalid solution format" };
  }

  const size = gameData.size || 8;
  const expectedTotal = size * size;

  if (candidatePath.length !== expectedTotal) {
    return {
      valid: false,
      error: `Path must visit all ${expectedTotal} cells (visited ${candidatePath.length})`,
    };
  }

  const visited = new Set();
  const walls = new Set(gameData.walls || []);
  const numbers = gameData.numbers || {};
  let currentExpectedNum = 1;

  for (let i = 0; i < candidatePath.length; i++) {
    const cell = candidatePath[i];
    if (visited.has(cell)) {
      return { valid: false, error: `Cell ${cell} visited more than once` };
    }
    visited.add(cell);

    if (i > 0) {
      const prev = candidatePath[i - 1];
      const edge = [prev, cell].sort().join("|");
      if (walls.has(edge)) {
        return { valid: false, error: `Path crossed wall between ${prev} and ${cell}` };
      }

      const [r1, c1] = prev.split("-").map(Number);
      const [r2, c2] = cell.split("-").map(Number);
      const dist = Math.abs(r1 - r2) + Math.abs(c1 - c2);
      if (dist !== 1) {
        return { valid: false, error: `Cells ${prev} and ${cell} are not adjacent` };
      }
    }

    const num = numbers[cell];
    if (typeof num === "number") {
      if (num !== currentExpectedNum) {
        return { valid: false, error: `Checkpoint ${num} reached out of order (expected ${currentExpectedNum})` };
      }
      currentExpectedNum += 1;
    }
  }

  return { valid: true };
}

module.exports = {
  generateZip,
  verifyZip,
};
