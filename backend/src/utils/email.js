"use strict";

const nodemailer = require("nodemailer");

const getEmailConfig = () => {
  const host = process.env.SMTP_HOST || "smtp-relay.brevo.com";
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = process.env.SMTP_SECURE === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return {
    host,
    port,
    secure,
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
  const transporter = getTransporter();
  await transporter.verify();
  return true;
};

const sendEmail = async ({ to, subject, text, html }) => {
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

  try {
    const transporter = getTransporter();
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"HireQuest" <no-reply@hirequest.com>',
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
