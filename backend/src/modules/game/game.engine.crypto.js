"use strict";

const crypto = require("crypto");

function createGameSeed() {
  return crypto.randomBytes(32).toString("hex");
}

function createDeterministicRandom(seed) {
  let counter = 0;

  return function random() {
    const hash = crypto
      .createHash("sha256")
      .update(`${seed}:${counter++}`)
      .digest();

    const value = hash.readUInt32BE(0);

    return value / 0x100000000;
  };
}

function randomInt(random, min, max) {
  if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
    throw new TypeError("Invalid random integer range");
  }

  return Math.floor(random() * (max - min + 1)) + min;
}

function shuffle(array, random) {
  const result = [...array];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));

    [result[index], result[swapIndex]] = [
      result[swapIndex],
      result[index],
    ];
  }

  return result;
}

module.exports = {
  createGameSeed,
  createDeterministicRandom,
  randomInt,
  shuffle,
};
