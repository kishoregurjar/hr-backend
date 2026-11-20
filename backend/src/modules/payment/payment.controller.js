"use strict";

const { StatusCodes } = require("http-status-codes");
const { asyncHandler } = require("../../utils/async-handler");
const { SuccessResponse } = require("../../common/response");
const paymentService = require("./payment.service");

class PaymentController {
  /**
   * Create Razorpay Purchase Order for Company Subscription
   * POST /api/v1/payments/order
   */
  createOrder = asyncHandler(async (req, res) => {
    const companyId = req.companyId;
    const actorRole = req.companyMember?.role;
    const { planId, billingCycle, couponCode } = req.body;

    const order = await paymentService.createSubscriptionOrder({
      companyId,
      planId,
      billingCycle,
      actorRole,
      couponCode,
    });

    return SuccessResponse.send(
      res,
      {
        message: "Payment order created successfully",
        data: order,
      },
      StatusCodes.CREATED
    );
  });

  /**
   * Verify Razorpay Payment Signature & Activate Subscription
   * POST /api/v1/payments/verify
   */
  verifyPayment = asyncHandler(async (req, res) => {
    const companyId = req.companyId;
    const actorRole = req.companyMember?.role;
    const orderId = req.body.orderId || req.body.razorpayOrderId || req.body.razorpay_order_id;
    const paymentId = req.body.paymentId || req.body.razorpayPaymentId || req.body.razorpay_payment_id;
    const signature = req.body.signature || req.body.razorpaySignature || req.body.razorpay_signature;

    const result = await paymentService.verifyAndActivateSubscription({
      companyId,
      orderId,
      paymentId,
      signature,
      actorRole,
    });

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Payment verified successfully",
        data: result,
      },
      StatusCodes.OK
    );
  });

  /**
   * Create Razorpay Onboarding Order for Public Visitor Registration
   * POST /api/v1/payments/onboarding-order
   */
  createOnboardingOrder = asyncHandler(async (req, res) => {
    const order = await paymentService.createOnboardingOrder(req.body);

    return SuccessResponse.send(
      res,
      {
        message: "Onboarding payment order created successfully",
        data: order,
      },
      StatusCodes.CREATED
    );
  });

  /**
   * Verify Onboarding Payment & Activate New Company Workspace
   * POST /api/v1/payments/onboarding-verify
   */
  verifyOnboardingPayment = asyncHandler(async (req, res) => {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const result = await paymentService.verifyOnboardingPayment({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (result.refreshToken) {
      try {
        const { setRefreshTokenCookie } = require("../auth/auth.utils");
        setRefreshTokenCookie(res, result.refreshToken);
      } catch (_) {}
    }

    return SuccessResponse.send(
      res,
      {
        message: result.message || "Payment verified and workspace activated successfully",
        data: result,
      },
      StatusCodes.OK
    );
  });

  /**
   * Get Company Payment History (strictly tenant isolated)
   * GET /api/v1/payments/history
   */
  getHistory = asyncHandler(async (req, res) => {
    const companyId = req.companyId;
    const history = await paymentService.getCompanyPaymentHistory(companyId);

    return SuccessResponse.send(
      res,
      {
        message: "Payment history retrieved successfully",
        data: {
          history,
          payments: history,
        },
      },
      StatusCodes.OK
    );
  });

  /**
   * Webhook callback from Razorpay
   * POST /api/v1/payments/webhook
   */
  webhook = asyncHandler(async (req, res) => {
    const rawBody = req.rawBody || req.body;
    const signature = req.headers["x-razorpay-signature"];

    await paymentService.handleWebhookEvent(rawBody, signature);

    return res.status(StatusCodes.OK).json({ status: "ok" });
  });
}

module.exports = new PaymentController();
