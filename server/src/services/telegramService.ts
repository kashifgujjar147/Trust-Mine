import crypto from 'node:crypto';
import { User } from '../models/index.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const token = () => process.env.TELEGRAM_BOT_TOKEN || '';

function hashCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export async function createTelegramLinkCode(userId: string) {
  const code = crypto.randomBytes(18).toString('base64url');
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);
  await User.findByIdAndUpdate(userId, {
    $set: { telegramLinkCodeHash: hashCode(code), telegramLinkExpiresAt: expiresAt }
  });
  return { code, expiresAt };
}

export async function unlinkTelegram(userId: string) {
  await User.findByIdAndUpdate(userId, { $unset: { telegramChatId: 1, telegramLinkCodeHash: 1, telegramLinkExpiresAt: 1 } });
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const botToken = token();
  if (!botToken) return false;
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  });
  return response.ok;
}

export async function sendTelegramNotification(userId: string, text: string) {
  const user = await User.findById(userId).select('telegramChatId').lean();
  if (!user?.telegramChatId) return false;
  try { return await sendTelegramMessage(user.telegramChatId, text); } catch { return false; }
}

export async function handleTelegramWebhook(update: any) {
  const message = update?.message;
  const chatId = String(message?.chat?.id || '');
  const text = String(message?.text || '').trim();
  if (!chatId || !text) return;
  if (!text.toLowerCase().startsWith('/link ')) {
    await sendTelegramMessage(chatId, 'Use /link <one-time-code> to securely link your TRUST MINE account.');
    return;
  }
  const code = text.slice(6).trim();
  if (!code || code.length > 200) {
    await sendTelegramMessage(chatId, 'Invalid linking code.');
    return;
  }
  const user = await User.findOneAndUpdate(
    { telegramLinkCodeHash: hashCode(code), telegramLinkExpiresAt: { $gt: new Date() } },
    { $set: { telegramChatId: chatId }, $unset: { telegramLinkCodeHash: 1, telegramLinkExpiresAt: 1 } },
    { new: true }
  );
  await sendTelegramMessage(chatId, user ? 'TRUST MINE account linked successfully.' : 'Linking code is invalid, expired, or already used.');
}
