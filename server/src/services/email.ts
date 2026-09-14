import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function sendPasswordResetEmail(
  email: string,
  fullName: string,
  resetUrl: string,
  expiresAt: Date,
) {
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: email,
    subject: 'Trust Mine - Reset Your Password',
    text: [
      `Hello ${fullName || 'there'},`,
      '',
      'We received a request to reset your Trust Mine password.',
      '',
      `Reset your password here: ${resetUrl}`,
      '',
      `This link expires at ${expiresAt.toISOString()}.`,
      '',
      'If you did not request this password reset, you can safely ignore this email.',
      '',
      'Trust Mine',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:30px">
        <h2>Trust Mine</h2>
        <p>Hello ${fullName || 'there'},</p>
        <p>We received a request to reset your Trust Mine password.</p>
        <p>
          <a href="${resetUrl}"
             style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">
            Reset Password
          </a>
        </p>
        <p>This link expires at ${expiresAt.toISOString()}.</p>
        <p>If you did not request this password reset, you can safely ignore this email.</p>
        <p>Trust Mine</p>
      </div>
    `,
  });
}
