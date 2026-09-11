import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { AuthedRequest } from '../middleware/auth.js';
import { createTelegramLinkCode, unlinkTelegram, handleTelegramWebhook } from '../services/telegramService.js';

export async function telegramLinkCode(req: AuthedRequest, res: Response) {
  const result = await createTelegramLinkCode(req.user!.id);
  res.json({ message: 'One-time Telegram linking code created', ...result });
}

export async function telegramUnlink(req: AuthedRequest, res: Response) {
  await unlinkTelegram(req.user!.id);
  res.json({ message: 'Telegram account unlinked' });
}

export async function telegramWebhook(req: Request, res: Response) {
  const expected = process.env.TELEGRAM_BOT_WEBHOOK_SECRET || '';
  const supplied = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  if (!expected || Buffer.byteLength(supplied) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return res.status(401).json({ message: 'Unauthorized' });
  await handleTelegramWebhook(req.body);
  res.json({ ok: true });
}
