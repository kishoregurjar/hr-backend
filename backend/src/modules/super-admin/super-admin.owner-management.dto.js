"use strict";

const buildOwnerResponse = (owner) => ({
  owner,
});

const buildActivationResponse = (activation) => ({
  activation,
});

module.exports = {
  buildOwnerResponse,
  buildActivationResponse,
};
