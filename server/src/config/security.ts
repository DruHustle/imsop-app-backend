const DEVELOPMENT_SECRET = 'development-only-change-me-32-characters';
const PLACEHOLDER_PATTERN = /(REPLACE_|YOUR-|RENDER_)/i;

export function getAllowedOrigins(): string[] {
  const configured = process.env.CORS_ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
  return configured.split(',').map(origin => origin.trim()).filter(Boolean);
}

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
    const origins = getAllowedOrigins();
    if (!origins.length || origins.some(origin => {
      try { return new URL(origin).protocol !== 'https:'; } catch { return true; }
    })) throw new Error('Production origins must be valid HTTPS URLs');
    if ([process.env.DATABASE_URL, process.env.ALLOWED_ORIGIN, process.env.PASSWORD_RESET_BASE_URL]
      .some(value => value && PLACEHOLDER_PATTERN.test(value))) {
      throw new Error('Production configuration contains unreplaced placeholders');
    }
    const emailProvider = process.env.EMAIL_PROVIDER || 'gmail';
    const gmailConfigured = Boolean((process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN) || process.env.GMAIL_APP_PASSWORD);
    const resendConfigured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
    if (emailProvider === 'gmail' && !gmailConfigured) throw new Error('Gmail OAuth credentials or GMAIL_APP_PASSWORD must be configured');
    if (emailProvider === 'gmail' && process.env.GMAIL_APP_PASSWORD
      && !/^[A-Za-z0-9]{16}$/.test(process.env.GMAIL_APP_PASSWORD.replace(/\s/g, ''))) {
      throw new Error('GMAIL_APP_PASSWORD must be a 16-character Google App Password');
    }
    if (emailProvider === 'resend' && !resendConfigured) throw new Error('RESEND_API_KEY and EMAIL_FROM must be configured');
    if (!['gmail', 'resend'].includes(emailProvider)) throw new Error('EMAIL_PROVIDER must be gmail or resend');
  }
  if (process.env.NODE_ENV === 'production') {
    let webhookSecrets: Record<string, string> = {};
    try { webhookSecrets = JSON.parse(process.env.LOGISTICS_WEBHOOK_SECRETS || '{}'); } catch { /* validated below */ }
    const secrets = Object.values(webhookSecrets);
    if (!secrets.length || secrets.some(secret => typeof secret !== 'string' || secret.length < 32)) {
      throw new Error('Every LOGISTICS_WEBHOOK_SECRETS provider secret must contain at least 32 characters');
    }
  }
}
