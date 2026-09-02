"use strict";

const buildCandidateOtpEmail = ({ otp, expiresAt }) => {
  const expiryText = new Date(expiresAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  return {
    subject: "HireQuest Assessment Verification Code",
    text:
      `Your HireQuest verification code is ${otp}.\n\n` +
      `This code expires at ${expiryText}.\n\n` +
      `If you did not request this verification, please ignore this email.`,

    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #333; }
            .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #edf2f7; }
            .header h2 { color: #1a202c; margin: 0; font-size: 24px; }
            .otp-box { background: #f7fafc; border: 2px dashed #4a5568; border-radius: 8px; font-size: 36px; font-weight: bold; letter-spacing: 10px; text-align: center; padding: 20px; margin: 28px 0; color: #2b6cb0; }
            .footer { font-size: 12px; color: #a0aec0; text-align: center; margin-top: 32px; border-top: 1px solid #edf2f7; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>HireQuest Assessment Verification</h2>
            </div>
            <p>Hello Candidate,</p>
            <p>Your 6-digit email verification code for your HireQuest assessment is:</p>
            <div class="otp-box">${otp}</div>
            <p><strong>Note:</strong> This verification code will expire in 5 minutes.</p>
            <p>If you did not request this verification code, you can safely ignore this email.</p>
            <div class="footer">
              This is an automated email from HireQuest. Please do not reply to this email.
            </div>
          </div>
        </body>
      </html>
    `,
  };
};

const buildInvitationEmail = ({ candidateName, assessmentTitle, testLink, expiresAt }) => {
  const expiryText = new Date(expiresAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  return {
    subject: `Invitation to complete assessment: ${assessmentTitle}`,
    text:
      `Hello ${candidateName || "Candidate"},\n\n` +
      `You have been invited to complete the assessment "${assessmentTitle}".\n\n` +
      `Click the following link to start your test:\n${testLink}\n\n` +
      `This invitation link expires at ${expiryText}.\n\n` +
      `Best regards,\nHireQuest Team`,

    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #333; }
            .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #edf2f7; }
            .header h2 { color: #1a202c; margin: 0; font-size: 24px; }
            .btn { display: inline-block; background-color: #3182ce; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; margin: 24px 0; }
            .footer { font-size: 12px; color: #a0aec0; text-align: center; margin-top: 32px; border-top: 1px solid #edf2f7; padding-top: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Assessment Invitation</h2>
            </div>
            <p>Hello ${candidateName || "Candidate"},</p>
            <p>You have been invited to complete the assessment <strong>${assessmentTitle}</strong>.</p>
            <div style="text-align: center;">
              <a href="${testLink}" class="btn" style="color: #ffffff;">Start Assessment</a>
            </div>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #4a5568;">${testLink}</p>
            <p><strong>Note:</strong> This invitation link expires on ${expiryText}.</p>
            <div class="footer">
              This is an automated email from HireQuest.
            </div>
          </div>
        </body>
      </html>
    `,
  };
};

module.exports = {
  buildCandidateOtpEmail,
  buildInvitationEmail,
};
