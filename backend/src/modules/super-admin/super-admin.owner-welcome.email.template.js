"use strict";

const { resolveCompanyOrigin } = require("../../utils/tenant-url");

const escapeHtml = (value = "") => {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const buildOwnerWelcomeEmail = ({
  ownerName,
  companyName,
  activationUrl,
  company,
  expiresAt,
}) => {
  const safeOwnerName = escapeHtml(ownerName);
  const safeCompanyName = escapeHtml(companyName);
  const safeActivationUrl = escapeHtml(activationUrl);

  const dedicatedDomain = company ? resolveCompanyOrigin(company) : null;
  const safeDomain = dedicatedDomain ? escapeHtml(dedicatedDomain) : null;

  const expirationText = new Date(expiresAt).toUTCString();

  return {
    subject: `Welcome to HireQuest — ${safeCompanyName}`,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; background-color: #f8fafc; padding: 24px 12px; margin: 0;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; padding: 32px; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.03);">
            <div style="border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px;">
              <h2 style="color: #2563eb; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">HireQuest Enterprise Workspace</h2>
            </div>
            
            <p style="font-size: 16px;">Hello <strong>${safeOwnerName}</strong>,</p>
            <p>Your enterprise organization account for <strong>${safeCompanyName}</strong> has been provisioned on HireQuest.</p>
            <p>You have been assigned as the <strong>Workspace Owner</strong> with full administrative privileges.</p>
            
            ${
              safeDomain
                ? `<div style="background-color: #f1f5f9; border-left: 4px solid #2563eb; border-radius: 6px; padding: 14px 18px; margin: 24px 0;">
                    <p style="margin: 0; font-size: 12px; color: #64748b; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Your Dedicated Workspace URL</p>
                    <p style="margin: 4px 0 0 0; font-size: 15px; color: #0f172a; font-weight: 700; word-break: break-all; font-family: monospace;">${safeDomain}</p>
                   </div>`
                : ""
            }

            <p>Please activate your workspace and create your account password by clicking the button below:</p>
            <div style="margin: 28px 0; text-align: center;">
              <a href="${safeActivationUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 2px 6px rgba(37,99,235,0.3);">Activate Workspace</a>
            </div>
            
            <p style="font-size: 13px; color: #64748b; margin-top: 24px;">This workspace activation link is unique and expires on <strong>${expirationText}</strong>.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="font-size: 12px; color: #94a3b8; margin: 0;">If you did not authorize this workspace creation, please contact your HireQuest platform administrator.</p>
          </div>
        </body>
      </html>
    `,
  };
};

module.exports = {
  buildOwnerWelcomeEmail,
};
