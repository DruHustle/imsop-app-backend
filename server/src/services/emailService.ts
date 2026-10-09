import { Resend } from 'resend';
import nodemailer from 'nodemailer';

type EmailProvider = 'gmail' | 'resend';
const provider = (): EmailProvider => process.env.EMAIL_PROVIDER === 'resend' ? 'resend' : 'gmail';
const resendSender = () => process.env.EMAIL_FROM || 'IMSOP <onboarding@resend.dev>';
const gmailSender = () => process.env.GMAIL_FROM || 'notifications.imsop@gmail.com';

function resendClient(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured');
  return new Resend(process.env.RESEND_API_KEY);
}

function gmailTransport() {
  const user = gmailSender();
  const smtp = { host: 'smtp.gmail.com', port: 465, secure: true } as const;
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) {
    return nodemailer.createTransport({
      ...smtp,
      auth: { type: 'OAuth2', user, clientId: process.env.GMAIL_CLIENT_ID, clientSecret: process.env.GMAIL_CLIENT_SECRET, refreshToken: process.env.GMAIL_REFRESH_TOKEN },
    });
  }
  if (process.env.GMAIL_APP_PASSWORD) return nodemailer.createTransport({ ...smtp, auth: { user, pass: process.env.GMAIL_APP_PASSWORD } });
  throw new Error('Gmail credentials are not configured');
}

export function isEmailConfigured(): boolean {
  if (provider() === 'resend') return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
  return Boolean((process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) || process.env.GMAIL_APP_PASSWORD);
}

export async function sendPasswordResetEmail(recipient: string, resetUrl: string): Promise<void> {
  const safeUrl = resetUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const subject = 'Reset your IMSOP password';
  const text = `A password reset was requested for your IMSOP account. This link expires in 15 minutes:\n\n${resetUrl}\n\nIf you did not request this, ignore this message.`;
  const html = `<p>A password reset was requested for your IMSOP account.</p><p><a href="${safeUrl}">Reset password</a></p><p>This link expires in 15 minutes. If you did not request this, ignore this message.</p>`;
  if (provider() === 'gmail') {
    await gmailTransport().sendMail({ from: `IMSOP Notifications <${gmailSender()}>`, to: recipient, subject, text, html });
    return;
  }
  const { error } = await resendClient().emails.send({ from: resendSender(), to: recipient, subject, text, html });
  if (error) throw new Error(`Resend delivery failed: ${error.message}`);
}
