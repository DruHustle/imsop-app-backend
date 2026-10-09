const DEVELOPMENT_SECRET = 'development-only-change-me-32-characters';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production' && (!secret || secret.length < 32)) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters in production');
  }
  return secret || DEVELOPMENT_SECRET;
}

export function assertProductionConfiguration(): void {
  getJwtSecret();
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be configured in production');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.ALLOWED_ORIGIN) {
    throw new Error('ALLOWED_ORIGIN must be configured in production');
  }
  if (process.env.NODE_ENV === 'production' && !process.env.PASSWORD_RESET_BASE_URL) {
    throw new Error('PASSWORD_RESET_BASE_URL must be configured in production');
  }
  if (process.env.NODE_ENV === 'production') {
    const emailProvider = process.env.EMAIL_PROVIDER || 'gmail';
    const gmailConfigured = Boolean((process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) || process.env.GMAIL_APP_PASSWORD);
    const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
    if (emailProvider === 'gmail' && !gmailConfigured) throw new Error('Gmail OAuth credentials or GMAIL_APP_PASSWORD must be configured');
    if (emailProvider === 'resend' && !resendConfigured) throw new Error('RESEND_API_KEY and EMAIL_FROM must be configured');
    if (!['gmail', 'resend'].includes(emailProvider)) throw new Error('EMAIL_PROVIDER must be gmail or resend');
  }
  if (process.env.NODE_ENV === 'production') {
    let webhookSecrets: Record<string, string> = {};
    try { webhookSecrets = JSON.parse(process.env.LOGISTICS_WEBHOOK_SECRETS || '{}'); } catch { /* validated below */ }
    if (!Object.values(webhookSecrets).some(secret => typeof secret === 'string' && secret.length >= 32)) {
      throw new Error('LOGISTICS_WEBHOOK_SECRETS must include at least one 32-character provider secret');
    }
  }
}
