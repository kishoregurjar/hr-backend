"use strict";

const nodemailer = require("nodemailer");

const getEmailConfig = () => {
  const host = process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST || "smtp-relay.brevo.com";
  const port = Number(process.env.BREVO_SMTP_PORT || process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.BREVO_SMTP_USER || process.env.SMTP_USER;
  const rawPass = process.env.BREVO_SMTP_PASSWORD || process.env.SMTP_PASS;
  const pass = rawPass ? rawPass.trim().replace(/\s+/g, "") : undefined;

  return {
    host,
    port,
    secure,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateLimit: 10,
    auth: user && pass ? { user, pass } : undefined,
  };
};

let transporterInstance = null;

const getTransporter = () => {
  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport(getEmailConfig());
  }
  return transporterInstance;
};

const verifyEmailTransport = async () => {
  if (process.env.GOOGLE_WEBHOOK_URL || process.env.BREVO_API_KEY) {
    return true;
  }
  const transporter = getTransporter();
  await transporter.verify();
  return true;
};

const sendEmail = async ({ to, subject, text, html, senderName: customSenderName }) => {
  if (!to) {
    const error = new Error("Recipient email is required.");
    error.code = "EMAIL_RECIPIENT_REQUIRED";
    throw error;
  }

  if (!subject) {
    const error = new Error("Email subject is required.");
    error.code = "EMAIL_SUBJECT_REQUIRED";
    throw error;
  }

  if (!text && !html) {
    const error = new Error("Email content is required.");
    error.code = "EMAIL_CONTENT_REQUIRED";
    throw error;
  }

  // 1. Primary: Google Apps Script Webhook (Direct native Gmail server dispatch — 100% Inbox delivery, zero DMARC rejection)
  if (process.env.GOOGLE_WEBHOOK_URL) {
    try {
      const senderName = customSenderName || process.env.MAIL_FROM_NAME || "HireQuest";
      const payload = JSON.stringify({
        to,
        subject,
        html,
        text,
        senderName,
      });

      const response = await fetch(process.env.GOOGLE_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload,
        redirect: "follow",
      });

      const textRes = await response.text();
      let data = {};
      try {
        data = JSON.parse(textRes);
      } catch (_) {
        data = { status: response.ok ? "success" : "error", raw: textRes };
      }

      if (!response.ok || data.status === "error") {
        const error = new Error(data.message || "Google Webhook email delivery failed.");
        error.code = "EMAIL_DELIVERY_FAILED";
        error.cause = data;
        throw error;
      }

      return {
        messageId: `<google_${Date.now()}@gmail.com>`,
        accepted: Array.isArray(to) ? to : [to],
        rejected: [],
        response: "250 OK",
      };
    } catch (error) {
      const emailError = new Error("Email delivery failed.");
      emailError.code = "EMAIL_DELIVERY_FAILED";
      emailError.cause = error;
      throw emailError;
    }
  }

  // 2. Secondary: Brevo REST API over HTTPS port 443
  if (process.env.BREVO_API_KEY) {
    try {
      const senderEmail = process.env.MAIL_FROM_EMAIL || process.env.EMAIL_FROM || "rshivamsingh378@gmail.com";
      const senderName = customSenderName || process.env.MAIL_FROM_NAME || "HireQuest";
      const toList = Array.isArray(to) ? to.map((e) => ({ email: e })) : [{ email: to }];

      const payload = JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: toList,
        subject,
        htmlContent: html || undefined,
        textContent: text || undefined,
      });

      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: payload,
      });

      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.message || "Brevo email delivery failed.");
        error.code = "EMAIL_DELIVERY_FAILED";
        error.cause = data;
        throw error;
      }

      return {
        messageId: data.messageId,
        accepted: Array.isArray(to) ? to : [to],
        rejected: [],
        response: "250 OK",
      };
    } catch (error) {
      const emailError = new Error("Email delivery failed.");
      emailError.code = "EMAIL_DELIVERY_FAILED";
      emailError.cause = error;
      throw emailError;
    }
  }

  try {
    const transporter = getTransporter();
    const sender = customSenderName
      ? `"${customSenderName}" <${process.env.BREVO_SMTP_USER || process.env.SMTP_USER || "no-reply@hirequest.app"}>`
      : (process.env.MAIL_FROM_EMAIL || process.env.EMAIL_FROM || '"HireQuest" <no-reply@hirequest.com>');
    const info = await transporter.sendMail({
      from: sender,
      to,
      subject,
      text,
      html,
    });

    return {
      messageId: info.messageId,
      accepted: info.accepted,
      rejected: info.rejected,
      response: info.response,
    };
  } catch (error) {
    const emailError = new Error("Email delivery failed.");
    emailError.code = "EMAIL_DELIVERY_FAILED";
    emailError.cause = error;
    throw emailError;
  }
};

module.exports = {
  sendEmail,
  verifyEmailTransport,
  getTransporter,
};
