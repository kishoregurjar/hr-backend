"use strict";

const couponService = require("./coupon.service");
const couponController = require("./coupon.controller");
const couponRoutes = require("./coupon.routes");
const couponConstants = require("./coupon.constants");

module.exports = {
  couponService,
  couponController,
  couponRoutes,
  ...couponConstants,
};
