import { Withdrawal, User } from '../models/index.js';
import { ClientSession } from 'mongoose';

export const WITHDRAWAL_WINDOW_START_HOUR = 10;
export const WITHDRAWAL_WINDOW_END_HOUR = 17;
export const WITHDRAWAL_TIMEZONE = process.env.WITHDRAWAL_TIMEZONE || 'Asia/Karachi';

export function getLocalHour(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WITHDRAWAL_TIMEZONE, hour: '2-digit', hour12: false
  }).formatToParts(date);
  const hour = Number(parts.find(p => p.type === 'hour')?.value);
  return hour === 24 ? 0 : hour;
}

export function isWithdrawalProcessingWindow(date = new Date()): boolean {
  const hour = getLocalHour(date);
  return hour >= WITHDRAWAL_WINDOW_START_HOUR && hour < WITHDRAWAL_WINDOW_END_HOUR;
}

export async function claimWithdrawalSlot(userId: string, now = new Date(), session?: ClientSession) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oid = userId;
  const existing = await Withdrawal.findOne({
    userId: oid,
    createdAt: { $gte: cutoff },
  }).session(session || null);
  if (existing) throw Object.assign(new Error('Only one withdrawal is allowed within a 24-hour period'), { statusCode: 429 });

  const updated = await User.findOneAndUpdate(
    { _id: oid, $or: [{ lastWithdrawalAt: { $exists: false } }, { lastWithdrawalAt: { $lt: cutoff } }] },
    { $set: { lastWithdrawalAt: now } },
    { new: true, session }
  );
  if (!updated) throw Object.assign(new Error('Only one withdrawal is allowed within a 24-hour period'), { statusCode: 429 });
  return updated;
}
