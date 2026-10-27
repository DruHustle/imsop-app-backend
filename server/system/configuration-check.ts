import assert from 'node:assert/strict';
import { assertProductionConfiguration } from '../src/config/security';
// Only the pure configuration validator is imported. No .env, API, database or
// mail module is loaded, and every credential below is an inert fixture.
const original = process.env;
const fixture = {
  NODE_ENV: 'production',
  JWT_SECRET: 'isolated-configuration-fixture-at-least-32-characters',
  DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1:1/never_connected',
  ALLOWED_ORIGIN: 'https://imsop.test',
  PASSWORD_RESET_BASE_URL: 'https://imsop.test/#/reset-password',
  RESET_DELIVERY_KEY: 'a'.repeat(64),
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 'inert-fixture-never-sent',
  EMAIL_FROM: 'IMSOP Verification <noreply@imsop.test>',
  LOGISTICS_WEBHOOK_SECRETS: JSON.stringify({ fixture: 'isolated-configuration-signing-secret-at-least-32-characters' }),
};
try {
  process.env = { ...fixture };
  assert.doesNotThrow(assertProductionConfiguration);
  for (const key of ['JWT_SECRET', 'DATABASE_URL', 'ALLOWED_ORIGIN', 'PASSWORD_RESET_BASE_URL', 'RESET_DELIVERY_KEY', 'RESEND_API_KEY', 'LOGISTICS_WEBHOOK_SECRETS']) {
    process.env = { ...fixture };
    delete process.env[key];
    assert.throws(assertProductionConfiguration, undefined, `Missing ${key} must fail closed`);
  }
  console.log('Production configuration: valid fixture accepted; all 7 missing required settings rejected. No API listener, database or mail transport was started.');
} finally {
  process.env = original;
}
