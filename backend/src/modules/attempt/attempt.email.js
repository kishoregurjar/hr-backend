"use strict";

const escapeHtml = (value = "") => {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const buildCandidateOtpEmail = ({
  otp,
  expiresAt,
  companyName = "HireQuest",
  candidateName = "Candidate",
  company = null,
}) => {
  const expiryText = new Date(expiresAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  const orgName = escapeHtml(company?.name || companyName || "HireQuest");
  const personName = escapeHtml(candidateName || "Candidate");
  const brandColor = company?.brandColor || "#2563eb";
  const logoUrl = company?.logoUrl ? escapeHtml(company.logoUrl) : null;
  const brandTagline = company?.brandTagline ? escapeHtml(company.brandTagline) : null;
  const showPoweredByHireQuest = company?.showPoweredByHireQuest !== false;

  return {
    subject: `${orgName} Assessment Verification Code`,
    text:
      `Hello ${personName},\n\n` +
      `Your ${orgName} verification code is ${otp}.\n\n` +
      `This code expires in 5 minutes (at ${expiryText}).\n\n` +
      `If you did not request this verification, please ignore this email.`,

    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b; }
            .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 36px; box-shadow: 0 4px 16px rgba(0,0,0,0.04); border: 1px solid #e2e8f0; }
            .header { text-align: center; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9; }
            .header img { max-height: 44px; max-width: 180px; margin-bottom: 14px; object-fit: contain; }
            .header h2 { color: #0f172a; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
            .header p.tagline { font-size: 12px; color: #64748b; font-weight: 500; margin: 4px 0 0 0; }
            .greeting { font-size: 15px; margin-top: 24px; color: #334155; }
            .otp-box { background: #f8fafc; border: 2px dashed ${brandColor}; border-radius: 12px; font-size: 38px; font-weight: 900; letter-spacing: 12px; text-align: center; padding: 22px; margin: 28px 0; color: ${brandColor}; font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; }
            .note { font-size: 13px; color: #64748b; line-height: 1.5; }
            .footer { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 36px; border-top: 1px solid #f1f5f9; padding-top: 20px; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoUrl ? `<img src="${logoUrl}" alt="${orgName}" /><br />` : ""}
              <h2>${orgName} Assessment Verification</h2>
              ${brandTagline ? `<p class="tagline">${brandTagline}</p>` : ""}
            </div>
            <p class="greeting">Hello <strong>${personName}</strong>,</p>
            <p style="color: #475569; font-size: 14px; line-height: 1.5;">
              Your one-time verification code for the <strong>${orgName}</strong> candidate assessment is:
            </p>
            <div class="otp-box">${otp}</div>
            <p class="note"><strong>Security Notice:</strong> This verification code is single-use and will expire in 5 minutes (${expiryText}).</p>
            <p class="note">If you did not initiate this assessment verification, you can safely ignore this email.</p>
            <div class="footer">
              This is an automated verification email on behalf of <strong>${orgName}</strong>.<br />
              ${showPoweredByHireQuest ? '<span style="font-size: 11px; color: #cbd5e1;">Powered by HireQuest SaaS</span>' : ""}
            </div>
          </div>
        </body>
      </html>
    `,
  };
};

const buildInvitationEmail = ({
  candidateName,
  assessmentTitle,
  testLink,
  expiresAt,
  companyName = "HireQuest",
  company = null,
}) => {
  const expiryText = new Date(expiresAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });

  const orgName = escapeHtml(company?.name || companyName || "HireQuest");
  const personName = escapeHtml(candidateName || "Candidate");
  const safeTitle = escapeHtml(assessmentTitle || "Skill Assessment");
  const safeTestLink = escapeHtml(testLink);
  const brandColor = company?.brandColor || "#2563eb";
  const logoUrl = company?.logoUrl ? escapeHtml(company.logoUrl) : null;
  const brandTagline = company?.brandTagline ? escapeHtml(company.brandTagline) : null;
  const showPoweredByHireQuest = company?.showPoweredByHireQuest !== false;

  return {
    subject: `${orgName} — Invitation to complete assessment: ${safeTitle}`,
    text:
      `Hello ${personName},\n\n` +
      `You have been invited by ${orgName} to complete the assessment "${safeTitle}".\n\n` +
      `Click the following link to start your test:\n${testLink}\n\n` +
      `This invitation link expires at ${expiryText}.\n\n` +
      `Best regards,\n${orgName} Hiring Team`,

    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b; }
            .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 36px; box-shadow: 0 4px 16px rgba(0,0,0,0.04); border: 1px solid #e2e8f0; }
            .header { text-align: center; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9; }
            .header img { max-height: 44px; max-width: 180px; margin-bottom: 14px; object-fit: contain; }
            .header h2 { color: #0f172a; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
            .header p.tagline { font-size: 12px; color: #64748b; font-weight: 500; margin: 4px 0 0 0; }
            .greeting { font-size: 15px; margin-top: 24px; color: #334155; }
            .btn { display: inline-block; background-color: ${brandColor}; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 700; font-size: 15px; margin: 24px 0; box-shadow: 0 4px 12px rgba(37,99,235,0.25); }
            .link-box { word-break: break-all; color: #64748b; font-size: 12px; background: #f8fafc; padding: 10px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-family: monospace; }
            .footer { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 36px; border-top: 1px solid #f1f5f9; padding-top: 20px; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoUrl ? `<img src="${logoUrl}" alt="${orgName}" /><br />` : ""}
              <h2>${orgName} Assessment Invitation</h2>
              ${brandTagline ? `<p class="tagline">${brandTagline}</p>` : ""}
            </div>
            <p class="greeting">Hello <strong>${personName}</strong>,</p>
            <p style="color: #475569; font-size: 14px; line-height: 1.5;">
              You have been invited by <strong>${orgName}</strong> to complete the official skills evaluation for <strong>${safeTitle}</strong>.
            </p>
            <div style="text-align: center;">
              <a href="${safeTestLink}" class="btn">Start Assessment</a>
            </div>
            <p style="font-size: 13px; color: #64748b;">Or open this link directly in your browser:</p>
            <p class="link-box">${safeTestLink}</p>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 18px;">
              <strong>Notice:</strong> This invitation link is unique to you and expires on <strong>${expiryText}</strong>.
            </p>
            <div class="footer">
              This is an automated invitation on behalf of <strong>${orgName}</strong>.<br />
              ${showPoweredByHireQuest ? '<span style="font-size: 11px; color: #cbd5e1;">Powered by HireQuest SaaS</span>' : ""}
            </div>
          </div>
        </body>
      </html>
    `,
  };
};

const buildAssessmentSubmissionEmail = ({
  candidateName,
  assessmentTitle,
  companyName = "HireQuest",
  company = null,
}) => {
  const orgName = escapeHtml(company?.name || companyName || "HireQuest");
  const personName = escapeHtml(candidateName || "Candidate");
  const safeTitle = escapeHtml(assessmentTitle || "Skill Assessment");
  const brandColor = company?.brandColor || "#2563eb";
  const logoUrl = company?.logoUrl ? escapeHtml(company.logoUrl) : null;
  const brandTagline = company?.brandTagline ? escapeHtml(company.brandTagline) : null;
  const showPoweredByHireQuest = company?.showPoweredByHireQuest !== false;

  return {
    subject: `${orgName} — Assessment Submitted Successfully: ${safeTitle}`,
    text:
      `Hello ${personName},\n\n` +
      `Thank you for completing the evaluation for ${safeTitle} at ${orgName}.\n\n` +
      `We have successfully received your submission.\n\n` +
      `Our Talent Acquisition & HR team is currently reviewing your assessment results. If your profile is shortlisted, our team will get in touch with you soon regarding the next steps.\n\n` +
      `Best regards,\n` +
      `${orgName} Recruitment Team`,

    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px 12px; color: #1e293b; }
            .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; padding: 36px; box-shadow: 0 4px 16px rgba(0,0,0,0.04); border: 1px solid #e2e8f0; }
            .header { text-align: center; padding-bottom: 24px; border-bottom: 1px solid #f1f5f9; }
            .header img { max-height: 44px; max-width: 180px; margin-bottom: 14px; object-fit: contain; }
            .header h2 { color: #0f172a; margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.3px; }
            .header p.tagline { font-size: 12px; color: #64748b; font-weight: 500; margin: 4px 0 0 0; }
            .greeting { font-size: 15px; margin-top: 24px; color: #334155; }
            .status-badge { display: inline-block; background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; font-size: 13px; font-weight: 700; padding: 8px 16px; border-radius: 9999px; margin: 16px 0; }
            .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; margin: 20px 0; }
            .info-card h4 { margin: 0 0 8px 0; color: #0f172a; font-size: 14px; font-weight: 700; }
            .info-card p { margin: 0; color: #475569; font-size: 13px; line-height: 1.6; }
            .footer { font-size: 12px; color: #94a3b8; text-align: center; margin-top: 36px; border-top: 1px solid #f1f5f9; padding-top: 20px; line-height: 1.6; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              ${logoUrl ? `<img src="${logoUrl}" alt="${orgName}" /><br />` : ""}
              <h2>${orgName}</h2>
              ${brandTagline ? `<p class="tagline">${brandTagline}</p>` : ""}
            </div>
            
            <p class="greeting">Hello <strong>${personName}</strong>,</p>
            
            <div style="text-align: center;">
              <span class="status-badge">✓ Assessment Submitted Successfully</span>
            </div>

            <p style="color: #475569; font-size: 14px; line-height: 1.6;">
              Thank you for taking the time to complete the official evaluation for <strong>${safeTitle}</strong> at <strong>${orgName}</strong>. We have securely received all your responses.
            </p>

            <div class="info-card">
              <h4>What happens next?</h4>
              <p>
                Our recruitment and technical team is currently reviewing your performance. If your profile is shortlisted, our HR team will reach out to you directly with the next steps and interview details.
              </p>
            </div>

            <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
              We truly appreciate your dedication and interest in joining our team. If you have any questions in the meantime, please feel free to reach out to our talent acquisition team.
            </p>

            <div class="footer">
              This is an automated confirmation sent on behalf of <strong>${orgName}</strong>.<br />
              ${showPoweredByHireQuest ? '<span style="font-size: 11px; color: #cbd5e1;">Powered by HireQuest SaaS</span>' : ""}
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
  buildAssessmentSubmissionEmail,
};
