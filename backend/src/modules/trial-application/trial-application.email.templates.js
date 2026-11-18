"use strict";

const escapeHtml = (unsafe) => {
  if (typeof unsafe !== "string") return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/**
 * Builds the HTML and plain-text email for Trial Application Email OTP Verification.
 */
const buildTrialOtpEmail = ({ otp, recipientEmail }) => {
  const safeOtp = escapeHtml(String(otp));
  const safeEmail = escapeHtml(recipientEmail);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HireQuest Verification Code</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #2563eb, #4f46e5); padding: 32px 24px; text-align: center; color: #ffffff; }
    .content { padding: 32px 24px; }
    .otp-card { background: #f1f5f9; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; border: 1px dashed #cbd5e1; }
    .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #1e293b; }
    .footer { padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 24px; font-weight: 800;">HireQuest</h1>
      <p style="margin: 6px 0 0; opacity: 0.9; font-size: 14px;">Trial Registration Email Verification</p>
    </div>
    <div class="content">
      <h2 style="font-size: 18px; margin-top: 0;">Verify your business email</h2>
      <p style="font-size: 14px; line-height: 1.6; color: #475569;">
        Please use the following 6-digit verification code to complete your HireQuest Demo Trial application for <strong>${safeEmail}</strong>.
      </p>
      <div class="otp-card">
        <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 8px;">Your 6-Digit Code</div>
        <div class="otp-code">${safeOtp}</div>
        <div style="font-size: 11px; color: #94a3b8; margin-top: 8px;">Valid for 10 minutes â€¢ Do not share this code</div>
      </div>
      <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
        If you did not initiate this request, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} HireQuest Inc. All rights reserved.
    </div>
  </div>
</body>
</html>`;

  const text = `HireQuest Email Verification Code: ${otp}\n\nUse this 6-digit code to complete your Demo Trial application for ${recipientEmail}. Valid for 10 minutes.`;

  return {
    subject: "Your HireQuest Verification Code",
    html,
    text,
  };
};

/**
 * Builds the HTML and plain-text email for Demo Trial Approval.
 * Meets User Requirement 7:
 * Subject: "Your HireQuest Free Trial Has Been Approved!"
 * Include: Owner name, Company name, Demo plan, Trial start date, Trial expiry date,
 * 2 HR seats, 20 lifetime unique candidates, 10 monthly assessment invitations,
 * Company-specific workspace URL, Login instructions.
 * Strictly NO tokens in workspace URL.
 */
const buildTrialApprovalEmail = ({
  ownerName,
  companyName,
  planName = "Demo Plan",
  startDate,
  endDate,
  seatLimit = null,
  candidateLimit = null,
  inviteLimit = null,
  durationDays = 30,
  durationHours = 720,
  workspaceUrl,
}) => {
  const safeOwner = escapeHtml(ownerName || "Organization Owner");
  const safeCompany = escapeHtml(companyName || "Your Organization");
  const safePlan = escapeHtml(planName);
  const safeStartDate = escapeHtml(startDate || "Today");
  const safeEndDate = escapeHtml(endDate || "In 30 days");
  const safeSeats =
    seatLimit !== null && seatLimit !== undefined && seatLimit !== "null"
      ? escapeHtml(String(seatLimit))
      : "Unlimited";
  const safeCandidates =
    candidateLimit !== null && candidateLimit !== undefined && candidateLimit !== "null"
      ? escapeHtml(String(candidateLimit))
      : "Unlimited";
  const safeInvites =
    inviteLimit !== null && inviteLimit !== undefined && inviteLimit !== "null"
      ? escapeHtml(String(inviteLimit))
      : "Unlimited";
  const computedDays = durationDays || (durationHours ? Math.max(1, Math.round(durationHours / 24)) : 30);
  const computedHours = durationHours || (computedDays * 24);
  const safeDays = escapeHtml(String(computedDays));
  const safeHours = escapeHtml(String(computedHours));
  const safeUrl = escapeHtml(workspaceUrl);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your HireQuest Free Trial Has Been Approved!</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #059669, #0d9488); padding: 36px 28px; text-align: center; color: #ffffff; }
    .badge { display: inline-block; padding: 4px 12px; background: rgba(255, 255, 255, 0.2); border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
    .content { padding: 36px 28px; }
    .quota-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 24px 0; }
    .quota-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 10px; text-align: center; }
    .quota-val { font-size: 20px; font-weight: 800; color: #0f172a; }
    .quota-lbl { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 4px; }
    .details-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 14px; padding: 20px; margin: 24px 0; }
    .detail-row { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; border-bottom: 1px dashed #dcfce7; }
    .detail-row:last-child { border-bottom: none; }
    .btn { display: block; width: 100%; box-sizing: border-box; background: linear-gradient(135deg, #2563eb, #4f46e5); color: #ffffff !important; text-align: center; padding: 16px 24px; border-radius: 12px; font-weight: 700; font-size: 15px; text-decoration: none; margin: 28px 0 16px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25); }
    .footer { padding: 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #f1f5f9; background: #fafafa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="badge">Application Approved</div>
      <h1 style="margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Your Free Trial Is Ready!</h1>
      <p style="margin: 8px 0 0; opacity: 0.95; font-size: 14px;">Welcome to HireQuest, ${safeOwner}</p>
    </div>

    <div class="content">
      <p style="font-size: 15px; line-height: 1.6; color: #334155; margin-top: 0;">
        Great news! The Super Admin team has reviewed and approved your application for <strong>${safeCompany}</strong>. Your ${safeDays}-day evaluation period is now officially active.
      </p>

      <!-- Quota Cards -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
        <tr>
          <td width="32%" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 8px; text-align: center;">
            <div style="font-size: 22px; font-weight: 800; color: #0f172a;">${safeSeats}</div>
            <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 4px;">Active HR Seats</div>
          </td>
          <td width="2%"></td>
          <td width="32%" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 8px; text-align: center;">
            <div style="font-size: 22px; font-weight: 800; color: #0f172a;">${safeCandidates}</div>
            <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 4px;">Candidates Pool</div>
          </td>
          <td width="2%"></td>
          <td width="32%" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 8px; text-align: center;">
            <div style="font-size: 22px; font-weight: 800; color: #0f172a;">${safeInvites}</div>
            <div style="font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; margin-top: 4px;">Monthly Invites</div>
          </td>
        </tr>
      </table>

      <!-- Activation Details Box -->
      <div class="details-box">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-size: 13px; color: #166534; padding: 6px 0; font-weight: 600;">Plan Tier:</td>
            <td style="font-size: 13px; color: #0f172a; padding: 6px 0; text-align: right; font-weight: 700;">${safePlan} (${safeDays}-Day Trial)</td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #166534; padding: 6px 0; font-weight: 600;">Trial Start:</td>
            <td style="font-size: 13px; color: #0f172a; padding: 6px 0; text-align: right; font-weight: 600;">${safeStartDate}</td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #166534; padding: 6px 0; font-weight: 600;">Trial Expiry:</td>
            <td style="font-size: 13px; color: #0f172a; padding: 6px 0; text-align: right; font-weight: 600;">${safeEndDate} (${safeHours} Hours)</td>
          </tr>
          <tr>
            <td style="font-size: 13px; color: #166534; padding: 6px 0; font-weight: 600;">Tenant Workspace:</td>
            <td style="font-size: 13px; color: #2563eb; padding: 6px 0; text-align: right; font-family: monospace; font-weight: 700;">${safeUrl}</td>
          </tr>
        </table>
      </div>

      <!-- Login CTA Button -->
      <a href="${safeUrl}" class="btn" target="_blank" rel="noopener noreferrer">
        Open Your ${safeCompany} Workspace &rarr;
      </a>

      <!-- Step-by-Step Instructions -->
      <div style="background: #f8fafc; border-radius: 12px; padding: 18px; margin-top: 20px; border: 1px solid #e2e8f0;">
        <h4 style="margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: #475569;">Login Instructions:</h4>
        <ol style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.6; color: #334155;">
          <li>Click the <strong>Open Your ${safeCompany} Workspace</strong> button above or navigate directly to your workspace URL: <code>${safeUrl}</code>.</li>
          <li>Log in using your registered business email and the password you set during registration.</li>
          <li>Invite your HR recruitment team, build your custom assessments, and start screening candidates immediately.</li>
        </ol>
      </div>

      <p style="font-size: 12px; color: #94a3b8; text-align: center; margin-top: 24px;">
        Security Notice: For your protection, workspace URLs do not contain session tokens or authentication secrets.
      </p>
    </div>

    <div class="footer">
      Questions? Reach out to <a href="mailto:support@hirequest.com" style="color: #2563eb;">support@hirequest.com</a><br>
      &copy; ${new Date().getFullYear()} HireQuest Inc. All rights reserved.
    </div>
  </div>
</body>
</html>`;

  const text = `Your HireQuest Free Trial Has Been Approved!

Hello ${ownerName},

Congratulations! Your Demo Trial application for ${companyName} has been approved by the HireQuest Super Admin team. Your ${safeDays}-day free trial is now officially active.

Trial & Plan Information:
- Plan Tier: ${planName} (${safeDays}-Day Free Trial)
- Trial Duration: ${safeDays} Days (exactly ${safeHours} hours)
- Trial Start Date & Time: ${startDate}
- Trial Expiry Date & Time: ${endDate}

Included Evaluation Quotas:
- ${safeSeats} Active HR Seats (Owner free)
- ${safeCandidates} Lifetime Unique Candidates Pool
- ${safeInvites} Monthly Assessment Invitations

Open Your ${companyName} Workspace:
${workspaceUrl}

Login Instructions:
1. Open your workspace URL: ${workspaceUrl}
2. Log in using your registered business email and the password you set during registration.
3. Invite your HR team, configure cognitive games, and start screening candidates.

Security Notice: Workspace URLs do not contain session tokens or temporary credentials.

HireQuest Support Team
support@hirequest.com`;

  return {
    subject: "Your HireQuest Free Trial Has Been Approved!",
    html,
    text,
  };
};

/**
 * Builds the HTML and plain-text email for Trial Application Rejection.
 */
const buildTrialRejectionEmail = ({ ownerName, companyName, reason }) => {
  const safeOwner = escapeHtml(ownerName || "Applicant");
  const safeCompany = escapeHtml(companyName || "Your Organization");
  const safeReason = escapeHtml(reason || "Unable to verify business identity or duplicate evaluation request.");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HireQuest Trial Application Update</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: #334155; padding: 28px 24px; text-align: center; color: #ffffff; }
    .content { padding: 32px 24px; }
    .notice-box { background: #fff1f2; border: 1px solid #fecdd3; border-radius: 12px; padding: 18px; margin: 20px 0; color: #9f1239; font-size: 13px; line-height: 1.6; }
    .footer { padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #f1f5f9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0; font-size: 22px; font-weight: 800;">HireQuest</h1>
      <p style="margin: 6px 0 0; opacity: 0.9; font-size: 13px;">Trial Application Status Update</p>
    </div>
    <div class="content">
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0;">
        Dear ${safeOwner},
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        Thank you for your interest in HireQuest for <strong>${safeCompany}</strong>.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        After reviewing your application, our administration team was unable to approve the requested Demo Trial at this time.
      </p>
      <div class="notice-box">
        <strong>Review Note:</strong> ${safeReason}
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #334155;">
        If you believe this was an error or would like to discuss customized enterprise evaluation options, please reach out to our team at <a href="mailto:sales@hirequest.com" style="color: #2563eb;">sales@hirequest.com</a>.
      </p>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} HireQuest Inc. All rights reserved.
    </div>
  </div>
</body>
</html>`;

  const text = `Dear ${ownerName},\n\nThank you for your interest in HireQuest for ${companyName}.\n\nAfter reviewing your application, our team was unable to approve the requested Demo Trial at this time.\n\nReview Note: ${reason}\n\nPlease reach out to sales@hirequest.com if you have questions.`;

  return {
    subject: "Update Regarding Your HireQuest Trial Application",
    html,
    text,
  };
};

module.exports = {
  buildTrialOtpEmail,
  buildTrialApprovalEmail,
  buildTrialRejectionEmail,
};

