"use strict";

function buildStartGameAttemptResponse(mappedAttempt) {
  return {
    attempt: mappedAttempt,
  };
}

function buildSubmitGameAttemptResponse(mappedResult) {
  return {
    result: mappedResult,
  };
}

module.exports = {
  buildStartGameAttemptResponse,
  buildSubmitGameAttemptResponse,
};
