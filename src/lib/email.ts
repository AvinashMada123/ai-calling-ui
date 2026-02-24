import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

const FROM = process.env.EMAIL_FROM || process.env.GMAIL_USER || "noreply@fwai.app";

export async function sendInviteEmail({
  to,
  orgName,
  role,
  inviteUrl,
  invitedByEmail,
}: {
  to: string;
  orgName: string;
  role: string;
  inviteUrl: string;
  invitedByEmail?: string;
}) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn("[Email] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping invite email");
    return { sent: false, reason: "Email not configured" };
  }

  const subject = `You've been invited to ${orgName}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
      <h2 style="margin: 0 0 16px; color: #111;">You're invited to <strong>${orgName}</strong></h2>
      <p style="color: #555; font-size: 15px; line-height: 1.5; margin: 0 0 8px;">
        ${invitedByEmail ? `<strong>${invitedByEmail}</strong> has invited you` : "You've been invited"} to join <strong>${orgName}</strong> as a <strong>${role}</strong>.
      </p>
      <p style="color: #555; font-size: 15px; line-height: 1.5; margin: 0 0 24px;">
        Click below to accept the invitation and create your account. This invite expires in 7 days.
      </p>
      <a href="${inviteUrl}"
         style="display: inline-block; background: #111; color: #fff; padding: 12px 28px; border-radius: 8px; font-size: 14px; font-weight: 600; text-decoration: none;">
        Accept Invitation
      </a>
      <p style="color: #999; font-size: 12px; margin-top: 32px;">
        If you didn't expect this invitation, you can safely ignore this email.
      </p>
    </div>
  `;

  await transporter.sendMail({
    from: FROM,
    to,
    subject,
    html,
  });

  return { sent: true };
}
