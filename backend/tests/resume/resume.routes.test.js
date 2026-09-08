"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const router = require("../../src/modules/resume/resume.routes");

describe("Resume Routes Suite", () => {
  it("exports valid express router instance", () => {
    assert.equal(typeof router, "function");
    assert.equal(typeof router.use, "function");
  });

  it("contains registered routes for POST / and GET /:id", () => {
    const stack = router.stack || [];
    const routes = stack
      .filter((layer) => layer.route)
      .map((layer) => ({
        path: layer.route.path,
        methods: Object.keys(layer.route.methods),
      }));

    const postRoot = routes.find((r) => r.path === "/" && r.methods.includes("post"));
    const getId = routes.find((r) => r.path === "/:id" && r.methods.includes("get"));

    assert.ok(postRoot, "POST / route must be registered");
    assert.ok(getId, "GET /:id route must be registered");
  });
});
