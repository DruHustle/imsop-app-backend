import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';

function providerSecrets(): Record<string, string> {
  try {
    return JSON.parse(process.env.LOGISTICS_WEBHOOK_SECRETS || '{}');
  } catch {
    throw new Error('LOGISTICS_WEBHOOK_SECRETS must be a valid JSON object');
  }
}

export function authenticateLogisticsWebhook(req: Request, res: Response, next: NextFunction) {
  const provider = req.params.provider;
  const signature = req.header('x-imsop-signature');
  const timestamp = req.header('x-imsop-timestamp');
  const secret = providerSecrets()[provider];
  const timestampSeconds = Number(timestamp);

  if (!secret || secret.length < 32 || !signature || !timestamp || !Number.isFinite(timestampSeconds)) {
    return res.status(401).json({ error: 'Invalid webhook credentials' });
  }
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > 300) {
    return res.status(401).json({ error: 'Webhook timestamp is outside the allowed window' });
  }

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${req.rawBody?.toString('utf8') || ''}`).digest('hex')}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  req.logisticsProvider = provider;
  next();
}
