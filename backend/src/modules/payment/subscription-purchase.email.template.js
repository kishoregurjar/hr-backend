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
 * Builds the HTML and plain-text email for Subscription Purchase / Renewal Confirmation.
 *
 * @param {Object} params
 * @param {string} params.ownerName
 * @param {string} params.companyName
 * @param {string} params.planName
 * @param {string} params.billingCycle
 * @param {number|string} params.amount
 * @param {string} params.currency
 * @param {string} params.paymentStatus
 * @param {string} params.razorpayPaymentId
 * @param {string} params.paymentDate
 * @param {string} params.startDate
 * @param {string} params.endDate
 * @param {number|string} params.seatLimit
 * @param {number|string} params.candidateLimit
 * @param {number|string} params.inviteLimit
 * @param {string} params.workspaceUrl
 * @param {string} [params.supportEmail="support@hirequest.com"]
 * @returns {{ subject: string, html: string, text: string }}
 */
const buildSubscriptionPurchaseEmail = ({
  ownerName,
  companyName,
  planName,
  billingCycle,
  amount,
  currency = "INR",
  paymentStatus = "CAPTURED",
  razorpayPaymentId,
  paymentDate,
  startDate,
  endDate,
  seatLimit,
  candidateLimit,
  inviteLimit,
  workspaceUrl,
  supportEmail = "support@hirequest.com",
}) => {
  const safeOwner = escapeHtml(ownerName || "Organization Owner");
  const safeCompany = escapeHtml(companyName || "Your Organization");
  const safePlan = escapeHtml(planName || "Standard");
  const safeCycle = escapeHtml(billingCycle || "MONTHLY");
  const safeCurrency = escapeHtml(currency || "INR");
  const safeStatus = escapeHtml(paymentStatus || "CAPTURED");
  const safePayId = escapeHtml(razorpayPaymentId || "N/A");
  const safePayDate = escapeHtml(paymentDate || "Today");
  const safeStartDate = escapeHtml(startDate || "Today");
  const safeEndDate = escapeHtml(endDate || "N/A");
  const safeSeats = escapeHtml(String(seatLimit ?? "Unlimited"));
  const safeCandidates = escapeHtml(String(candidateLimit ?? "Unlimited"));
  const safeInvites = escapeHtml(String(inviteLimit ?? "Unlimited"));
  const safeUrl = escapeHtml(workspaceUrl);
  const safeSupport = escapeHtml(supportEmail);

  const formattedAmount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currency || "INR",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

  const subject = "Your HireQuest Subscription is Successfully Activated!";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 28px 12px; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.5;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 18px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);">
    
    <!-- Brand Header -->
    <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px;">
      <div style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 8px 16px; border-radius: 12px; font-weight: 900; font-size: 16px; letter-spacing: -0.5px; box-shadow: 0 2px 8px rgba(79, 70, 229, 0.25);">
        HireQuest
      </div>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
        Assessment & Cognitive Screening Platform
      </p>
    </div>

    <!-- Success Badge & Heading -->
    <div style="text-align: center; margin-bottom: 28px;">
      <div style="display: inline-block; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; border-radius: 9999px; padding: 4px 14px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px;">
        ✓ Payment Verified &amp; Activated
      </div>
      <h1 style="margin: 0; color: #0f172a; font-size: 22px; font-weight: 900; letter-spacing: -0.5px;">
        Your Subscription is Live!
      </h1>
      <p style="margin: 8px 0 0 0; color: #475569; font-size: 14px;">
        Hello <strong>${safeOwner}</strong>, your workspace for <strong>${safeCompany}</strong> has been successfully upgraded to the <strong>${safePlan}</strong>.
      </p>
    </div>

    <!-- Purchase & Payment Summary Card -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin-bottom: 24px;">
      <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        💳 Payment &amp; Order Confirmation
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; color: #64748b; width: 45%;">Plan Tier:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 800; text-align: right;">${safePlan}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Billing Cycle:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 700; text-align: right; text-transform: capitalize;">${safeCycle}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Amount Paid:</td>
          <td style="padding: 6px 0; color: #059669; font-weight: 900; font-size: 15px; text-align: right;">${formattedAmount} ${safeCurrency}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Payment Status:</td>
          <td style="padding: 6px 0; color: #059669; font-weight: 800; text-align: right;">${safeStatus}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Razorpay Payment ID:</td>
          <td style="padding: 6px 0; color: #0f172a; font-family: monospace; font-size: 12px; font-weight: 700; text-align: right;">${safePayId}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Transaction Date:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 600; text-align: right;">${safePayDate}</td>
        </tr>
      </table>
    </div>

    <!-- Subscription Quotas & Validity Card -->
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px; margin-bottom: 28px;">
      <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        📊 Subscription Validity &amp; Quotas
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tr>
          <td style="padding: 6px 0; color: #64748b; width: 50%;">Subscription Start:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 700; text-align: right;">${safeStartDate}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Subscription Expiry:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 700; text-align: right;">${safeEndDate}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Active HR Seats:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 800; text-align: right;">${safeSeats} (Owner free)</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Lifetime Talent Pool:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 800; text-align: right;">${safeCandidates} candidates</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;">Monthly Assessment Invites:</td>
          <td style="padding: 6px 0; color: #0f172a; font-weight: 800; text-align: right;">${safeInvites} / month</td>
        </tr>
      </table>
    </div>

    <!-- Prominent Call to Action Button -->
    <div style="text-align: center; margin: 32px 0 24px 0;">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 12px; font-weight: 800; font-size: 15px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.35); letter-spacing: -0.2px;">
        Open Your HireQuest Workspace &rarr;
      </a>
      <p style="margin: 12px 0 0 0; font-size: 11px; color: #94a3b8;">
        Direct Tenant Link: <a href="${safeUrl}" style="color: #4f46e5; text-decoration: underline; word-break: break-all;">${safeUrl}</a>
      </p>
    </div>

    <!-- Footer Support Info -->
    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.6;">
      <p style="margin: 0 0 4px 0;">
        Need help or have questions regarding your subscription? Contact our team at <a href="mailto:${safeSupport}" style="color: #4f46e5; text-decoration: none; font-weight: 600;">${safeSupport}</a>.
      </p>
      <p style="margin: 0; font-size: 11px; color: #cbd5e1;">
        HireQuest Assessment Platform &bull; Automated Subscription Notification &bull; Do not reply to this email
      </p>
    </div>

  </div>
</body>
</html>
  `;

  const text = `
Your HireQuest Subscription is Successfully Activated!

Hello ${ownerName},

Your workspace for "${companyName}" has been successfully upgraded to the ${planName} Plan (${billingCycle}).

PURCHASE SUMMARY:
---------------------------------------------
- Plan Tier: ${planName}
- Billing Cycle: ${billingCycle}
- Amount Paid: ${formattedAmount} ${currency}
- Payment Status: ${paymentStatus}
- Razorpay Payment ID: ${razorpayPaymentId}
- Transaction Date: ${paymentDate}

SUBSCRIPTION DETAILS & QUOTAS:
---------------------------------------------
- Subscription Start: ${startDate}
- Subscription Expiry: ${endDate}
- Active HR Seats: ${seatLimit} (Owner free)
- Lifetime Talent Pool: ${candidateLimit} unique candidates
- Monthly Assessment Invites: ${inviteLimit} invitations/month

OPEN YOUR WORKSPACE:
---------------------------------------------
Access your workspace dashboard using the following link:
${workspaceUrl}

Need support? Contact us at ${supportEmail}.

Thank you for choosing HireQuest!
  `.trim();

  return { subject, html, text };
};

module.exports = {
  buildSubscriptionPurchaseEmail,
};

