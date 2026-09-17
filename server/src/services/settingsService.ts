import { SystemSetting, Reward } from '../models/index.js';

export const defaults = {
  currency: 'USD',
  minimumDeposit: 2,
  minimumWithdrawal: 1,
  withdrawalFeePercent: 8,
  commissionRates: [10, 2, 1, 1],
  rewardTiers: [
    {
      threshold: 50,
      reward: 2,
      status: 'ACTIVE',
      sortOrder: 1,
    },
    {
      threshold: 100,
      reward: 5,
      status: 'ACTIVE',
      sortOrder: 2,
    },
    {
      threshold: 200,
      reward: 10,
      status: 'ACTIVE',
      sortOrder: 3,
    },
    {
      threshold: 500,
      reward: 25,
      status: 'ACTIVE',
      sortOrder: 4,
    },
  ],
  cycleIntervalHours: 24,
  packageDurationDays: 365,
  maintenanceMode: false,
  supportEmail: 'support@trustmine.example',
  supportPhone: '+92 315 3430862',
};

export async function getSettings() {
  const [rows, rewardTiers] = await Promise.all([
    SystemSetting.find().lean(),
    Reward.find({
      status: 'ACTIVE',
    })
      .sort({
        threshold: 1,
      })
      .lean(),
  ]);

  const out = {
    ...defaults,
  } as typeof defaults & Record<string, unknown>;

  for (const r of rows) {
    const key = r.key;

    if (typeof key === 'string' && key.length > 0) {
      out[key] = r.value;
    }
  }

  if (rewardTiers.length > 0) {
    out.rewardTiers = rewardTiers.map((tier) => ({
      threshold: Number(tier.threshold),
      reward: Number(tier.reward),
      status: String(tier.status),
      sortOrder: Number(tier.sortOrder ?? 0),
    }));
  }

  return out;
}

export async function setSetting(
  key: string,
  value: unknown
) {
  return SystemSetting.findOneAndUpdate(
    { key },
    { value },
    {
      upsert: true,
      new: true,
    }
  );
}