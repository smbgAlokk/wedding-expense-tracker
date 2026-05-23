const nodemailer = require('nodemailer');

// Provider-agnostic SMTP. Works with Resend, SendGrid, Mailgun, Gmail, Mailtrap,
// etc. — they all expose SMTP host/port/user/pass. Configure via env:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
const SMTP_FROM = process.env.SMTP_FROM || 'Wedding Expense Tracker <no-reply@weddingtracker.app>';

const isEmailConfigured = () => Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);

let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: Number(SMTP_PORT) === 465, // 465 = implicit TLS; 587/others = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Send a password-reset email. If SMTP isn't configured (e.g. local dev), the
 * link is logged to the server console instead of throwing — so the flow stays
 * testable without an email provider. Returns { sent: boolean }.
 */
async function sendPasswordResetEmail(to, resetUrl, name) {
  const safeName = escapeHtml(name || 'there');
  const subject = 'Reset your Wedding Expense Tracker password';
  const text =
    `Hi ${name || 'there'},\n\n` +
    `We received a request to reset your password. Open the link below to set a new one. ` +
    `This link expires in 1 hour.\n\n${resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password won't change.`;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f1316">
    <div style="text-align:center;font-size:40px">💒</div>
    <h2 style="text-align:center;color:#D84381;margin:8px 0 16px">Reset your password</h2>
    <p>Hi ${safeName},</p>
    <p>We received a request to reset your Wedding Expense Tracker password. Tap the button below to set a new one. This link expires in <strong>1 hour</strong>.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${resetUrl}" style="background:#D84381;color:#fff;text-decoration:none;padding:12px 28px;border-radius:999px;font-weight:600;display:inline-block">Reset password</a>
    </p>
    <p style="font-size:13px;color:#666">If the button doesn't work, copy this link into your browser:<br>
      <a href="${resetUrl}" style="color:#D84381;word-break:break-all">${resetUrl}</a>
    </p>
    <p style="font-size:13px;color:#666">If you didn't request this, you can safely ignore this email — your password won't change.</p>
  </div>`;

  if (!isEmailConfigured()) {
    console.warn('[Email] SMTP not configured. Password reset link (dev only):\n  ' + resetUrl);
    return { sent: false };
  }

  await getTransporter().sendMail({ from: SMTP_FROM, to, subject, text, html });
  return { sent: true };
}

module.exports = { sendPasswordResetEmail, isEmailConfigured };
