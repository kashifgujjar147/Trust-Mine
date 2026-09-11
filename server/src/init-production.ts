import {connectDB} from './config/db.js';
import {
  Package,
  Reward,
  PromoCode,
  PaymentMethod,
  SystemSetting
} from './models/index.js';
import {env} from './config/env.js';

const packages = [
  ['Starter House', 2, 0.08],
  ['Dream House', 5, 0.2],
  ['Family House', 10, 0.4],
  ['Modern House', 20, 0.8],
  ['Luxury House', 50, 2],
  ['Premium Residence', 100, 4],
  ['Grand Residence', 250, 10],
  ['Royal Residence', 500, 20]
];

async function main() {
  if (env.NODE_ENV !== 'production') {
    throw new Error('This initializer is intended for production only.');
  }

  await connectDB();

  let inserted = {
    packages: 0,
    rewards: 0,
    promoCodes: 0,
    paymentMethods: 0,
    settings: 0
  };

  for (const [name, amount, daily] of packages) {
    const exists = await Package.findOne({name});

    if (!exists) {
      await Package.create({
        name,
        amount,
        cycleDays: 365,
        incomeConfiguration: {
          daily,
          total: Number(daily) * 365
        },
        description: 'Illustrative configurable package rule.',
        status: 'ACTIVE',
        sortOrder: inserted.packages + 1
      });

      inserted.packages++;
    }
  }

  const rewards = [
    [50, 2],
    [100, 5],
    [200, 10],
    [500, 25]
  ];

  for (const [threshold, reward] of rewards) {
    const exists = await Reward.findOne({threshold});

    if (!exists) {
      await Reward.create({
        threshold,
        reward,
        status: 'ACTIVE',
        sortOrder: inserted.rewards + 1
      });

      inserted.rewards++;
    }
  }

  const promoExists = await PromoCode.findOne({code: 'WELCOME10'});

  if (!promoExists) {
    await PromoCode.create({
      code: 'WELCOME10',
      rewardType: 'FIXED',
      rewardValue: 10,
      usageLimit: 100,
      perUserLimit: 1,
      minRequirement: 0,
      status: 'ACTIVE'
    });

    inserted.promoCodes++;
  }

  const paymentMethods = [
    {
      code: 'EASYPAISA',
      name: 'Easypaisa',
      instructions: 'Use the configured merchant/account details and submit the provider reference.',
      accountDetails: 'DEMO-MERCHANT',
      minAmount: 2,
      displayOrder: 1,
      verificationMode: 'MANUAL'
    },
    {
      code: 'BEP20',
      name: 'BEP20',
      instructions: 'Send only through the configured BNB Smart Chain/BEP20 route and submit the transaction hash.',
      accountDetails: 'DEMO_BEP20_WALLET',
      minAmount: 2,
      displayOrder: 2,
      verificationMode: 'MANUAL'
    },
    {
      code: 'BANK',
      name: 'Bank Transfer',
      instructions: 'Use the configured bank details and submit the transfer reference/proof.',
      accountDetails: 'DEMO BANK / IBAN CONFIG',
      minAmount: 2,
      displayOrder: 3,
      verificationMode: 'MANUAL'
    },
    {
      code: 'CUSTOM',
      name: 'Custom Method',
      instructions: 'Administrator-configurable payment instructions.',
      accountDetails: 'CONFIGURE IN ADMIN',
      minAmount: 2,
      displayOrder: 4,
      verificationMode: 'MANUAL'
    }
  ];

  for (const method of paymentMethods) {
    const exists = await PaymentMethod.findOne({code: method.code});

    if (!exists) {
      await PaymentMethod.create(method);
      inserted.paymentMethods++;
    }
  }

  const settings = [
    ['currency', 'USD'],
    ['minimumDeposit', 2],
    ['minimumWithdrawal', 1],
    ['withdrawalFeePercent', 8],
    ['commissionRates', [10, 2, 1, 1]],
    ['cycleIntervalHours', 24],
    ['packageDurationDays', 365],
    ['maintenanceMode', false],
    ['supportEmail', 'support@trustmine.example'],
    ['supportPhone', '+1 000 0000000']
  ];

  for (const [key, value] of settings) {
    const exists = await SystemSetting.findOne({key});

    if (!exists) {
      await SystemSetting.create({key, value});
      inserted.settings++;
    }
  }

  console.log('');
  console.log('======================================');
  console.log(' TRUST MINE PRODUCTION INITIALIZED');
  console.log('======================================');
  console.log(`Packages inserted:       ${inserted.packages}`);
  console.log(`Rewards inserted:        ${inserted.rewards}`);
  console.log(`Promo codes inserted:    ${inserted.promoCodes}`);
  console.log(`Payment methods inserted:${inserted.paymentMethods}`);
  console.log(`Settings inserted:       ${inserted.settings}`);
  console.log('======================================');
  console.log('Existing data was NOT deleted.');
  console.log('======================================');

  process.exit(0);
}

main().catch(error => {
  console.error('Production initializer failed:', error);
  process.exit(1);
});
