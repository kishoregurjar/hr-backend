"use strict";

const escapeHtml = (value = "") => {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const buildPlatformAdminWelcomeEmail = ({
  adminName,
  activationUrl,
  expiresAt,
}) => {
  const safeAdminName = escapeHtml(adminName);
  const safeActivationUrl = escapeHtml(activationUrl);

  const expirationText = new Date(expiresAt).toUTCString();

  return {
    subject: "Invitation: Platform Administrator Access — HireQuest",
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #4f46e5;">Welcome to HireQuest</h2>
            <p>Hello <strong>${safeAdminName}</strong>,</p>
            <p>You have been invited as a <strong>Platform Administrator</strong> for HireQuest.</p>
            <p>Please activate your administrator account and set your password by clicking the button below:</p>
            <div style="margin: 25px 0;">
              <a href="${safeActivationUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Activate Your Administrator Account</a>
            </div>
            <p style="font-size: 0.9em; color: #64748b;">This activation link expires on <strong>${expirationText}</strong>.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
            <p style="font-size: 0.85em; color: #94a3b8;">If you did not expect this invitation, please contact your HireQuest system administrator.</p>
          </div>
        </body>
      </html>
    `,
  };
};

module.exports = {
  buildPlatformAdminWelcomeEmail,
};
