"use strict";

async function runConcurrently(task, count) {
  if (!Number.isInteger(count) || count <= 0) {
    throw new TypeError("count must be a positive integer");
  }

  const tasks = Array.from({ length: count }, (_, index) =>
    Promise.resolve().then(() => task(index))
  );

  return Promise.allSettled(tasks);
}

function countFulfilled(results) {
  return results.filter((result) => result.status === "fulfilled").length;
}

function countRejected(results) {
  return results.filter((result) => result.status === "rejected").length;
}

module.exports = {
  runConcurrently,
  countFulfilled,
  countRejected,
};
