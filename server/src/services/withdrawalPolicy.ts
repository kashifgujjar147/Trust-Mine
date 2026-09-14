import { Withdrawal, User } from '../models/index.js';
import { ClientSession } from 'mongoose';

export const WITHDRAWAL_WINDOW_START_HOUR = 10;
export const WITHDRAWAL_WINDOW_END_HOUR = 17;
export const WITHDRAWAL_TIMEZONE =
  process.env.WITHDRAWAL_TIMEZONE || 'Asia/Karachi';

const DAY_MS = 24 * 60 * 60 * 1000;

export function getLocalHour(date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WITHDRAWAL_TIMEZONE,
    hour: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const hour = Number(
    parts.find((p) => p.type === 'hour')?.value
  );

  return hour === 24 ? 0 : hour;
}

function getLocalParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WITHDRAWAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value || 0);

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function getOffsetMs(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: WITHDRAWAL_TIMEZONE,
    timeZoneName: 'longOffset',
  }).formatToParts(date);

  const value =
    parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';

  const match = value.match(
    /^GMT([+-])(\d{2}):?(\d{2})?$/
  );

  if (!match) return 0;

  const sign = match[1] === '+' ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);

  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function zonedLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0
): Date {
  const guess = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second)
  );

  return new Date(
    guess.getTime() - getOffsetMs(guess)
  );
}

function nextWindowStart(now: Date): Date {
  const local = getLocalParts(now);

  if (local.hour < WITHDRAWAL_WINDOW_START_HOUR) {
    return zonedLocalToUtc(
      local.year,
      local.month,
      local.day,
      WITHDRAWAL_WINDOW_START_HOUR
    );
  }

  return zonedLocalToUtc(
    local.year,
    local.month,
    local.day + 1,
    WITHDRAWAL_WINDOW_START_HOUR
  );
}

export function isWithdrawalProcessingWindow(
  date = new Date()
): boolean {
  const hour = getLocalHour(date);

  return (
    hour >= WITHDRAWAL_WINDOW_START_HOUR &&
    hour < WITHDRAWAL_WINDOW_END_HOUR
  );
}

export async function getWithdrawalEligibility(
  userId: string,
  now = new Date()
) {
  const user = await User.findById(userId)
    .select('lastWithdrawalAt')
    .lean();

  const lastWithdrawalAt = user?.lastWithdrawalAt
    ? new Date(user.lastWithdrawalAt)
    : null;

  const cooldownAt = lastWithdrawalAt
    ? new Date(lastWithdrawalAt.getTime() + DAY_MS)
    : null;

  let nextAvailableAt: Date | null = null;

  if (cooldownAt && cooldownAt > now) {
    nextAvailableAt = cooldownAt;
  }

  if (!isWithdrawalProcessingWindow(now)) {
    const windowStart = nextWindowStart(now);

    if (!nextAvailableAt || windowStart > nextAvailableAt) {
      nextAvailableAt = windowStart;
    }
  }

  const eligible = !nextAvailableAt || nextAvailableAt <= now;

  return {
    eligible,
    nextWithdrawalAt: eligible
      ? null
      : nextAvailableAt?.toISOString() || null,
    lastWithdrawalAt:
      lastWithdrawalAt?.toISOString() || null,
    windowStart: '10:00',
    windowEnd: '17:00',
    timezone: WITHDRAWAL_TIMEZONE,
  };
}

export async function claimWithdrawalSlot(
  userId: string,
  now = new Date(),
  session?: ClientSession
) {
  if (!isWithdrawalProcessingWindow(now)) {
    throw Object.assign(
      new Error(
        'Withdrawals are available only from 10:00 AM to 5:00 PM Pakistan time'
      ),
      { statusCode: 409 }
    );
  }

  const cutoff = new Date(now.getTime() - DAY_MS);
  const oid = userId;

  const existing = await Withdrawal.findOne({
    userId: oid,
    createdAt: { $gte: cutoff },
  }).session(session || null);

  if (existing) {
    throw Object.assign(
      new Error(
        'Only one withdrawal is allowed within a 24-hour period'
      ),
      { statusCode: 429 }
    );
  }

  const updated = await User.findOneAndUpdate(
    {
      _id: oid,
      $or: [
        { lastWithdrawalAt: { $exists: false } },
        { lastWithdrawalAt: { $lt: cutoff } },
      ],
    },
    { $set: { lastWithdrawalAt: now } },
    { new: true, session }
  );

  if (!updated) {
    throw Object.assign(
      new Error(
        'Only one withdrawal is allowed within a 24-hour period'
      ),
      { statusCode: 429 }
    );
  }

  return updated;
}
