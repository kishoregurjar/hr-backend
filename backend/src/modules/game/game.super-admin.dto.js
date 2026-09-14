"use strict";

function buildGameListResponse(games) {
  return {
    games,
    total: games.length,
  };
}

function buildGameResponse(game) {
  return {
    game,
  };
}

module.exports = {
  buildGameListResponse,
  buildGameResponse,
};
