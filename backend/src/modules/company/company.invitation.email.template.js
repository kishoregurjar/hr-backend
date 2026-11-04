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

const createCompanyInvitationEmail = ({
  companyName,
  inviterName,
  role,
  invitationUrl,
  expiresAt,
  company = null,
}) => {
  const formattedExpiration = new Date(expiresAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const orgName = escapeHtml(company?.name || companyName || "Company");
  const brandColor = company?.brandColor || "#2563eb";
  const logoUrl = company?.logoUrl ? escapeHtml(company.logoUrl) : null;
  const brandTagline = company?.brandTagline ? escapeHtml(company.brandTagline) : null;
  const showPoweredByHireQuest = company?.showPoweredByHireQuest !== false;
  const safeInvitationUrl = escapeHtml(invitationUrl);

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${orgName} - Team Invitation</title>
</head>
<body style="margin: 0; padding: 24px 12px; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
    ${
      logoUrl
        ? `<div style="text-align: center; margin-bottom: 24px;">
            <img src="${logoUrl}" alt="${orgName}" style="max-height: 48px; max-width: 200px; object-fit: contain;" />
           </div>`
        : `<div style="text-align: center; margin-bottom: 20px;">
            <span style="font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">${orgName}</span>
           </div>`
    }
    <h1 style="margin-top: 0; color: #0f172a; font-size: 22px; font-weight: 800; text-align: center; letter-spacing: -0.5px;">
      You're invited to join ${orgName}
    </h1>
    <p style="color: #475569; font-size: 15px; line-height: 1.6; text-align: center; margin-top: 8px;">
      ${escapeHtml(inviterName) || "A workspace administrator"} has invited you to join the recruitment team at <strong>${orgName}</strong> as a <strong>${escapeHtml(role)}</strong>.
    </p>
    <div style="text-align: center; margin: 32px 0;">
      <a href="${safeInvitationUrl}" style="display: inline-block; padding: 13px 32px; background-color: ${brandColor}; color: #ffffff; text-decoration: none; border-radius: 10px; font-size: 15px; font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        Accept Team Invitation
      </a>
    </div>
    <p style="font-size: 13px; color: #64748b; line-height: 1.6; text-align: center;">
      Or copy and open this URL in your browser:<br />
      <span style="display: inline-block; word-break: break-all; color: ${brandColor}; font-family: monospace; font-size: 12px; margin-top: 6px;">${safeInvitationUrl}</span>
    </p>
    <div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5;">
      ${brandTagline ? `<p style="margin-bottom: 8px; color: #64748b; font-style: italic;">&ldquo;${brandTagline}&rdquo;</p>` : ""}
      <p style="margin: 0;">This invitation expires on <strong>${formattedExpiration}</strong>.</p>
      ${showPoweredByHireQuest ? '<p style="margin: 6px 0 0 0; font-size: 11px; color: #cbd5e1;">Powered by HireQuest SaaS</p>' : ""}
    </div>
  </div>
</body>
</html>
  `;
};

module.exports = {
  createCompanyInvitationEmail,
};
