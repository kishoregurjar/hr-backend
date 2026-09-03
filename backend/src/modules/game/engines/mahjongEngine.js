"use strict";

const TILE_DESIGNS = [
  { id: "wind_east", type: "wind", symbol: "東", color: "#1D4ED8" },
  { id: "wind_south", type: "wind", symbol: "南", color: "#1D4ED8" },
  { id: "wind_west", type: "wind", symbol: "西", color: "#1D4ED8" },
  { id: "wind_north", type: "wind", symbol: "北", color: "#1D4ED8" },
  { id: "dragon_red", type: "dragon", symbol: "中", color: "#DC2626" },
  { id: "dragon_green", type: "dragon", symbol: "發", color: "#059669" },
  { id: "dragon_white", type: "dragon", symbol: "", color: "#1D4ED8" },
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
];

const DIFFICULTIES = {
  easy: { label: "Easy (5x6)", rows: 5, cols: 6 },
  medium: { label: "Medium (6x8)", rows: 6, cols: 8 },
  hard: { label: "Hard (8x10)", rows: 8, cols: 10 },
};

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function canTilesMatch(board, p1, p2) {
  const t1 = board[p1.row]?.[p1.col];
  const t2 = board[p2.row]?.[p2.col];
  if (!t1 || !t2) return false;
  if (t1.design.id !== t2.design.id) return false;

  if (isAdjacent(p1, p2)) return true;

  if (p1.row === p2.row) {
    const startC = Math.min(p1.col, p2.col);
    const endC = Math.max(p1.col, p2.col);
    for (let c = startC + 1; c < endC; c++) {
      if (board[p1.row][c] !== null) return false;
    }
    return true;
  }

  if (p1.col === p2.col) {
    const startR = Math.min(p1.row, p2.row);
    const endR = Math.max(p1.row, p2.row);
    for (let r = startR + 1; r < endR; r++) {
      if (board[r][p1.col] !== null) return false;
    }
    return true;
  }

  return false;
}

function getAvailablePair(board) {
  const rows = board.length;
  const cols = board[0].length;
  for (let r1 = 0; r1 < rows; r1++) {
    for (let c1 = 0; c1 < cols; c1++) {
      const t1 = board[r1][c1];
      if (!t1) continue;

      for (let r2 = 0; r2 < rows; r2++) {
        for (let c2 = 0; c2 < cols; c2++) {
          if (r1 === r2 && c1 === c2) continue;
          const t2 = board[r2][c2];
          if (!t2 || t2.design.id !== t1.design.id) continue;

          if (canTilesMatch(board, { row: r1, col: c1 }, { row: r2, col: c2 })) {
            return [
              { row: r1, col: c1 },
              { row: r2, col: c2 },
            ];
          }
        }
      }
    }
  }
  return null;
}

function createBoard(difficulty = "medium") {
  const config = DIFFICULTIES[difficulty] || DIFFICULTIES.medium;
  const totalTiles = config.rows * config.cols;
  const pairs = [];

  for (let i = 0; i < totalTiles / 2; i++) {
    const design = TILE_DESIGNS[i % TILE_DESIGNS.length];
    pairs.push(design, design);
  }

  let board;
  let attempts = 0;

  while (attempts < 100) {
    const shuffled = shuffle(pairs);
    board = Array.from({ length: config.rows }, (_, r) =>
      Array.from({ length: config.cols }, (_, c) => {
        const design = shuffled[r * config.cols + c];
        return {
          id: `tile-${r}-${c}-${design.id}-${Math.random().toString(36).substring(2, 6)}`,
          design,
        };
      })
    );

    if (getAvailablePair(board)) {
      break;
    }
    attempts += 1;
  }

  return board;
}

function getPushChain(currentBoard, r, c, dr, dc) {
  const chain = [];
  let currR = r;
  let currC = c;

  const actualRows = currentBoard.length;
  const actualCols = currentBoard[0]?.length || 0;

  while (currR >= 0 && currR < actualRows && currC >= 0 && currC < actualCols) {
    const tile = currentBoard[currR][currC];
    if (tile === null) {
      let emptyCount = 0;
      let er = currR;
      let ec = currC;
      while (er >= 0 && er < actualRows && ec >= 0 && ec < actualCols && currentBoard[er][ec] === null) {
        emptyCount++;
        er += dr;
        ec += dc;
      }
      return { canPush: true, chain, emptyCount };
    }
    chain.push({ ...tile, startR: currR, startC: currC });
    currR += dr;
    currC += dc;
  }

  return { canPush: false, chain: [], emptyCount: 0 };
}

function verifyMahjong(result) {
  if (!result || typeof result !== "object") {
    return { valid: false, error: "Invalid Mahjong result format" };
  }

  const score = Number(result.score || 0);
  return { valid: true, score: Math.min(100, Math.max(0, score)) };
}

module.exports = {
  TILE_DESIGNS,
  DIFFICULTIES,
  shuffle,
  isAdjacent,
  canTilesMatch,
  getAvailablePair,
  createBoard,
  getPushChain,
  verifyMahjong,
};
