"use strict";

const createCompanyInvitationEmail = ({
  companyName,
  inviterName,
  role,
  invitationUrl,
  expiresAt,
}) => {
  const formattedExpiration = new Date(expiresAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Company Invitation</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f7fb; font-family: Arial, Helvetica, sans-serif;">
  <div style="max-width: 600px; margin: 40px auto; padding: 32px; background: #ffffff; border-radius: 8px;">
    <h1 style="margin-top: 0; color: #111827; font-size: 24px;">
      You're invited to join ${companyName}
    </h1>
    <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
      ${inviterName || "A company administrator"} has invited you to join
      <strong>${companyName}</strong> as a <strong>${role}</strong>.
    </p>
    <div style="margin: 32px 0;">
      <a href="${invitationUrl}" style="display: inline-block; padding: 12px 24px; background: #111827; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px;">
        Accept Invitation
      </a>
    </div>
    <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
      This invitation expires on <strong>${formattedExpiration}</strong>.
    </p>
    <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">
      If you were not expecting this invitation, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
  `;
};

module.exports = {
  createCompanyInvitationEmail,
};
