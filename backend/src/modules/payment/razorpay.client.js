"use strict";

const crypto = require("node:crypto");
const Razorpay = require("razorpay");
const { AppError } = require("../../utils/app-error");
const logger = require("../../config/logger");

/**
 * Initializes and returns the official Razorpay SDK instance using environment credentials.
 * Only Razorpay Test Mode keys should be configured in this environment.
 */
const getRazorpayInstance = () => {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET || process.env.RAZORPAY_SECRET_KEY;

  if (!keyId || !keySecret) {
    throw new AppError(
      "Razorpay API credentials (RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET) are missing. Please configure your Razorpay Test Key and Secret in backend/.env.",
      { statusCode: 500, code: "RAZORPAY_NOT_CONFIGURED", isOperational: true }
    );
  }

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
};

/**
 * Creates an official Razorpay order in Test Mode.
 * Server-side price computation ensures the amount cannot be manipulated by the client.
 *
 * @param {Object} params
 * @param {number} params.amount - Amount in smallest currency unit (paise: 1 INR = 100 paise)
 * @param {string} [params.currency="INR"]
 * @param {string} params.receipt - Internal unique receipt reference
 * @param {Object} [params.notes={}] - Metadata attached to order
 * @returns {Promise<Object>} Razorpay Order entity
 */
const createRazorpayOrder = async ({ amount, currency = "INR", receipt, notes = {} }) => {
  const razorpay = getRazorpayInstance();

  try {
    const order = await razorpay.orders.create({
      amount: Math.round(amount),
      currency: currency.toUpperCase(),
      receipt: String(receipt).slice(0, 40),
      notes,
    });
    return order;
  } catch (error) {
    logger.error("Razorpay order creation failed", {
      error: error.message,
      statusCode: error.statusCode,
      code: error.code,
    });

    if (error.statusCode === 401 || error.code === "BAD_REQUEST_ERROR") {
      throw new AppError(
        `Razorpay API authentication failed: ${error.error?.description || error.message}. Please verify your RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend/.env.`,
        { statusCode: 400, code: "RAZORPAY_AUTH_FAILED", isOperational: true }
      );
    }

    throw new AppError(
      error.error?.description || error.message || "Failed to create Razorpay payment order.",
      { statusCode: error.statusCode || 500, code: "RAZORPAY_ORDER_FAILED", isOperational: true }
    );
  }
};

/**
 * Fetches server-side payment entity from Razorpay REST API to verify payment state directly.
 * Ensures a subscription is never activated without verified captured payment confirmation.
 *
 * @param {string} paymentId - Razorpay payment ID (e.g. pay_...)
 * @returns {Promise<Object>} Razorpay Payment entity
 */
const fetchRazorpayPayment = async (paymentId) => {
  const razorpay = getRazorpayInstance();

  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    logger.error("Razorpay payment fetch failed", {
      paymentId,
      error: error.message,
    });
    throw new AppError(
      `Failed to fetch payment status from Razorpay: ${error.error?.description || error.message}`,
      { statusCode: 400, code: "RAZORPAY_FETCH_FAILED", isOperational: true }
    );
  }
};

/**
 * Captures an authorized Razorpay payment if it has not yet been automatically captured.
 *
 * @param {string} paymentId
 * @param {number} amountPaise
 * @param {string} [currency="INR"]
 * @returns {Promise<Object>} Captured Razorpay Payment entity
 */
const captureRazorpayPayment = async (paymentId, amountPaise, currency = "INR") => {
  const razorpay = getRazorpayInstance();

  try {
    const captured = await razorpay.payments.capture(paymentId, amountPaise, currency);
    return captured;
  } catch (error) {
    logger.error("Razorpay payment capture failed", {
      paymentId,
      error: error.message,
    });
    throw new AppError(
      `Failed to capture payment on Razorpay: ${error.error?.description || error.message}`,
      { statusCode: 400, code: "RAZORPAY_CAPTURE_FAILED", isOperational: true }
    );
  }
};

/**
 * Cryptographically verifies Razorpay Checkout HMAC SHA256 payment signature.
 * Prevents tampered payment payloads and unauthorized activation.
 *
 * @param {Object} params
 * @param {string} params.orderId - Razorpay Order ID
 * @param {string} params.paymentId - Razorpay Payment ID
 * @param {string} params.signature - Razorpay Signature from Checkout.js
 * @returns {boolean}
 */
const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
  const secret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET || process.env.RAZORPAY_SECRET_KEY;
  if (!secret || !orderId || !paymentId || !signature) {
    return false;
  }

  const generatedSignature = crypto
    .createHmac("sha256", secret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const sigBuffer = Buffer.from(signature, "utf-8");
  const genBuffer = Buffer.from(generatedSignature, "utf-8");

  if (sigBuffer.length !== genBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, genBuffer);
};

/**
 * Cryptographically verifies Razorpay Webhook signature using the webhook secret and raw request body.
 *
 * @param {Buffer|string} rawBody - Untouched raw request body
 * @param {string} webhookSignature - Value of 'x-razorpay-signature' header
 * @param {string} [webhookSecret] - Optional override; falls back to process.env.RAZORPAY_WEBHOOK_SECRET
 * @returns {boolean}
 */
const verifyWebhookSignature = (rawBody, webhookSignature, webhookSecret) => {
  const secret = webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !webhookSignature || !rawBody) {
    return false;
  }

  const payloadBuffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody), "utf-8");

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payloadBuffer)
    .digest("hex");

  const sigBuffer = Buffer.from(webhookSignature, "utf-8");
  const expBuffer = Buffer.from(expectedSignature, "utf-8");

  if (sigBuffer.length !== expBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(sigBuffer, expBuffer);
};

module.exports = {
  createRazorpayOrder,
  fetchRazorpayPayment,
  captureRazorpayPayment,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
