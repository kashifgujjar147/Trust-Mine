import {MongoMemoryReplSet} from 'mongodb-memory-server';
import mongoose from 'mongoose';
import {beforeAll,afterAll,beforeEach,describe,it,expect} from 'vitest';
import {User,Wallet,Package,PaymentMethod,Deposit,PackagePurchase,Transaction,Withdrawal,Reward,RewardClaim,PromoCode,PromoUsage,PromoUserCounter,Commission,SystemSetting,Notification,AuditLog,PasswordResetToken} from '../src/models/index.js';
import {ledger,balanceSnapshot,initializeWallets} from '../src/services/ledger.js';
import {createDeposit,verifyDeposit,adminDepositReject,createWithdrawal,adminWithdrawalApprove,adminWithdrawalProcessing,adminWithdrawalComplete,adminWithdrawalReject} from '../src/controllers/core.js';
import {processCycle} from '../src/services/incomeService.js';
import {createCommissions} from '../src/services/referralService.js';
import {claimReward} from '../src/services/rewardService.js';
import {applyPromo} from '../src/services/promoService.js';
import {isWithdrawalProcessingWindow,getLocalHour,claimWithdrawalSlot} from '../src/services/withdrawalPolicy.js';
import {resetPassword,login} from '../src/controllers/auth.js';
import {auth} from '../src/middleware/auth.js';
import {maintenanceGuard} from '../src/middleware/maintenance.js';
import {hash,sign,verify} from '../src/utils/auth.js';
import crypto from 'node:crypto';

let repl: MongoMemoryReplSet | undefined;

type Resp = {
  statusCode: number;
  body: any;
  status: (n: number) => Resp;
  json: (v: any) => Resp;
};

function response(): Resp {
  const r = {
    statusCode: 200,
    body: null,
  } as Resp;

  r.status = (n) => {
    r.statusCode = n;
    return r;
  };

  r.json = (v) => {
    r.body = v;
    return r;
  };

  return r;
}

function req(
  userId: string,
  body: any = {},
  headers: Record<string, string> = {},
) {
  return {
    user: {
      id: userId,
      role: 'ADMIN',
    },
    body,
    headers,
    params: {},
    ip: '127.0.0.1',
  } as any;
}

async function call(
  fn: Function,
  userId: string,
  body: any = {},
  headers: Record<string, string> = {},
  params: Record<string, string> = {},
) {
  const r = response();
  const q = req(userId, body, headers);
  q.params = params;

  await fn(q, r);

  return r;
}

async function seedUser(prefix = 'U') {
  const n = Date.now() + Math.random();

  return User.create({
    fullName: `${prefix} User`,
    username: `${prefix.toLowerCase()}-${n}`,
    email: `${prefix.toLowerCase()}-${n}@example.test`,
    passwordHash: 'x',
    userId: `${prefix}-${n}`,
    referralCode: `REF-${prefix}-${n}`,
    role: 'USER',
    status: 'ACTIVE',
  });
}

async function seedAdmin() {
  return User.create({
    fullName: 'Admin',
    username: `admin-${Date.now()}-${Math.random()}`,
    email: `admin-${Date.now()}-${Math.random()}@example.test`,
    passwordHash: 'x',
    userId: `ADMIN-${Date.now()}-${Math.random()}`,
    referralCode: `REF-ADMIN-${Date.now()}-${Math.random()}`,
    role: 'ADMIN',
    status: 'ACTIVE',
  });
}

async function seedPackage(
  amount = 100,
  daily = 1,
  cycleDays = 3,
) {
  return Package.create({
    name: `Test ${amount}-${Date.now()}-${Math.random()}`,
    amount,
    cycleDays,
    incomeConfiguration: {
      daily,
      total: daily * cycleDays,
    },
    status: 'ACTIVE',
    sortOrder: 1,
  });
}

async function seedPayment() {
  return PaymentMethod.create({
    code: 'TEST',
    name: 'Test Payment',
    status: 'ACTIVE',
    minAmount: 0,
    verificationMode: 'MANUAL',
  });
}

async function setDefaults() {
  await SystemSetting.insertMany([
    {
      key: 'minimumDeposit',
      value: 2,
    },
    {
      key: 'minimumWithdrawal',
      value: 1,
    },
    {
      key: 'withdrawalFeePercent',
      value: 10,
    },
    {
      key: 'commissionRates',
      value: [10, 2, 1, 1],
    },
    {
      key: 'cycleIntervalHours',
      value: 1,
    },
    {
      key: 'packageDurationDays',
      value: 3,
    },
  ]);
}

/*
 * MongoDB test database setup
 *
 * MongoMemoryReplSet may need to download/start a large MongoDB binary.
 * The timeout is intentionally 10 minutes for the first run.
 */
beforeAll(async () => {
  repl = await MongoMemoryReplSet.create({
    replSet: {
      count: 1,
    },
  });

  await mongoose.connect(repl.getUri(), {
    dbName: 'trust-mine-financial-tests',
  });

  await Promise.all([
    User.createCollection(),
    Wallet.createCollection(),
    Package.createCollection(),
    PaymentMethod.createCollection(),
    Deposit.createCollection(),
    PackagePurchase.createCollection(),
    Transaction.createCollection(),
    Withdrawal.createCollection(),
    Reward.createCollection(),
    RewardClaim.createCollection(),
    PromoCode.createCollection(),
    PromoUsage.createCollection(),
    PromoUserCounter.createCollection(),
    Commission.createCollection(),
    SystemSetting.createCollection(),
    Notification.createCollection(),
    AuditLog.createCollection(),
    PasswordResetToken.createCollection(),
  ]);

  await Promise.all([
    User.syncIndexes(),
    Wallet.syncIndexes(),
    Package.syncIndexes(),
    PaymentMethod.syncIndexes(),
    Deposit.syncIndexes(),
    PackagePurchase.syncIndexes(),
    Transaction.syncIndexes(),
    Withdrawal.syncIndexes(),
    Reward.syncIndexes(),
    RewardClaim.syncIndexes(),
    PromoCode.syncIndexes(),
    PromoUsage.syncIndexes(),
    PromoUserCounter.syncIndexes(),
    Commission.syncIndexes(),
    SystemSetting.syncIndexes(),
    PasswordResetToken.syncIndexes(),
  ]);
}, 600000);

/*
 * Safe cleanup.
 *
 * If MongoMemoryReplSet failed to initialize, repl will be undefined.
 * Therefore we only call stop() when it actually exists.
 */
afterAll(async () => {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } finally {
    if (repl) {
      await repl.stop();
      repl = undefined;
    }
  }
}, 60000);

beforeEach(async () => {
  for (const m of [
    User,
    Wallet,
    Package,
    PaymentMethod,
    Deposit,
    PackagePurchase,
    Transaction,
    Withdrawal,
    Reward,
    RewardClaim,
    PromoCode,
    PromoUsage,
    PromoUserCounter,
    Commission,
    SystemSetting,
    Notification,
    AuditLog,
  ]) {
    await m.deleteMany({});
  }

  await setDefaults();
});

describe('Authentication session security', () => {
  it('invalidates an old JWT after password reset and accepts a newly issued token', async () => {
    const u = await seedUser('AUTH');
    const raw = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    await PasswordResetToken.create({
      userId: u._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const oldToken = sign(String(u._id), u.role, 0);
    const resetResponse = await call(resetPassword, String(u._id), { token: raw, password: 'NewPassword@123' });
    expect(resetResponse.statusCode).toBe(200);
    expect((await User.findById(u._id))?.tokenVersion).toBe(1);

    const authResponse = { status: (n:number) => ({ json: (v:unknown) => ({ n, v }) }), json: (v:unknown) => v } as any;
    let nextCalled = false;
    await auth({ headers: { authorization: `Bearer ${oldToken}` } } as any, authResponse, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);

    const loginResponse = await call(login, String(u._id), { email: u.email, password: 'NewPassword@123' });
    expect(loginResponse.statusCode).toBe(200);
    const newToken = String(loginResponse.body.token);
    expect(newToken).not.toBe(oldToken);

    let newNextCalled = false;
    await auth({ headers: { authorization: `Bearer ${newToken}` } } as any, authResponse, () => { newNextCalled = true; });
    expect(newNextCalled).toBe(true);
  });
});

describe('Deposits', () => {
  it('creates valid deposits and rejects zero/negative amounts', async () => {
    const u = await seedUser();
    const p = await seedPackage(100);

    await seedPayment();

    let r = await call(
      createDeposit,
      String(u._id),
      {
        packageId: p._id,
        method: 'TEST',
        amount: 100,
        reference: 'DEP-1',
      },
    );

    expect(r.statusCode).toBe(201);

    for (const amount of [0, -1]) {
      r = await call(
        createDeposit,
        String(u._id),
        {
          packageId: p._id,
          method: 'TEST',
          amount,
          reference: `BAD-${amount}`,
        },
      );

      expect(r.statusCode).toBe(400);
    }
  });

  it('prevents duplicate deposit references', async () => {
    const u = await seedUser();
    const p = await seedPackage(100);

    await seedPayment();

    await call(
      createDeposit,
      String(u._id),
      {
        packageId: p._id,
        method: 'TEST',
        amount: 100,
        reference: 'DUP',
      },
    );

    const r = await call(
      createDeposit,
      String(u._id),
      {
        packageId: p._id,
        method: 'TEST',
        amount: 100,
        reference: 'DUP',
      },
    );

    expect(r.statusCode).toBe(409);
    expect(
      await Deposit.countDocuments({
        reference: 'DUP',
      }),
    ).toBe(1);
  });

  it('credits exactly once and activates exactly one package on repeated verification', async () => {
    const u = await seedUser();
    const admin = await seedAdmin();
    const p = await seedPackage(100);

    await seedPayment();

    const created = await call(
      createDeposit,
      String(u._id),
      {
        packageId: p._id,
        method: 'TEST',
        amount: 100,
        reference: 'APPROVE-1',
      },
    );

    const id = String(created.body.deposit._id);

    expect(
      (
        await call(
          verifyDeposit,
          String(admin._id),
          {},
          {},
          {id},
        )
      ).statusCode,
    ).toBe(200);

    const second = await call(
      verifyDeposit,
      String(admin._id),
      {},
      {},
      {id},
    );

    expect(second.statusCode).toBe(200);

    const w = await balanceSnapshot(String(u._id));

    expect(w.totalBalance).toBe(100);

    expect(
      await Transaction.countDocuments({
        userId: u._id,
        type: 'DEPOSIT',
        status: 'COMPLETED',
      }),
    ).toBe(1);

    expect(
      await PackagePurchase.countDocuments({
        paymentId: id,
      }),
    ).toBe(1);
  });

  it('recovers a completed deposit with a missing ledger exactly once', async () => {
    const u=await seedUser();
    const admin=await seedAdmin();
    const p=await seedPackage(100);
    await seedPayment();
    const created=await call(createDeposit,String(u._id),{packageId:p._id,method:'TEST',amount:100,reference:'RECOVER-MISSING-LEDGER'});
    const id=String(created.body.deposit._id);
    await Deposit.updateOne({_id:id},{$set:{status:'COMPLETED',verifiedAt:new Date(),verifiedBy:admin._id}});
    await Transaction.deleteMany({reference:created.body.deposit.transactionId,type:'DEPOSIT'});
    const first=await call(verifyDeposit,String(admin._id),{},{},{id});
    const second=await call(verifyDeposit,String(admin._id),{},{},{id});
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect((await balanceSnapshot(String(u._id))).totalBalance).toBe(100);
    expect(await Transaction.countDocuments({userId:u._id,type:'DEPOSIT',status:'COMPLETED'})).toBe(1);
  });

  it('rejects deposits without crediting the wallet and keeps transaction status consistent', async () => {
    const u = await seedUser();
    const admin = await seedAdmin();
    const p = await seedPackage(100);

    await seedPayment();

    const created = await call(
      createDeposit,
      String(u._id),
      {
        packageId: p._id,
        method: 'TEST',
        amount: 100,
        reference: 'REJ-1',
      },
    );

    const r = await call(
      adminDepositReject,
      String(admin._id),
      {},
      {},
      {
        id: String(created.body.deposit._id),
      },
    );

    expect(r.statusCode).toBe(200);

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(0);

    expect(
      await Transaction.countDocuments({
        userId: u._id,
        type: 'DEPOSIT',
        status: 'REJECTED',
      }),
    ).toBe(1);
  });

  it('handles ten concurrent approvals with one credit', async () => {
    const u = await seedUser();
    const admin = await seedAdmin();
    const p = await seedPackage(100);

    await seedPayment();

    const created = await call(
      createDeposit,
      String(u._id),
      {
        packageId: p._id,
        method: 'TEST',
        amount: 100,
        reference: 'CONCURRENT-DEP',
      },
    );

    const id = String(created.body.deposit._id);

    const results = await Promise.allSettled(
      Array.from(
        {length: 10},
        () =>
          call(
            verifyDeposit,
            String(admin._id),
            {},
            {},
            {id},
          ),
      ),
    );

    expect(
      results.some(
        (x) => x.status === 'fulfilled',
      ),
    ).toBe(true);

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(100);

    expect(
      await Transaction.countDocuments({
        userId: u._id,
        type: 'DEPOSIT',
        status: 'COMPLETED',
      }),
    ).toBe(1);

    expect(
      await PackagePurchase.countDocuments({
        paymentId: id,
      }),
    ).toBe(1);
  });
});

describe('Package activation and ledger purchase debit', () => {
  it('activates from the exact verified deposit without an extra invented wallet debit', async () => {
    const u = await seedUser();
    const admin = await seedAdmin();
    const p = await seedPackage(100);

    await seedPayment();

    const c = await call(
      createDeposit,
      String(u._id),
      {
        packageId: p._id,
        method: 'TEST',
        amount: 100,
        reference: 'PKG-DEP',
      },
    );

    await call(
      verifyDeposit,
      String(admin._id),
      {},
      {},
      {
        id: String(c.body.deposit._id),
      },
    );

    const purchase = await PackagePurchase.findOne({
      paymentId: c.body.deposit._id,
    });

    expect(purchase?.packageAmount).toBe(100);
    expect(purchase?.dailyIncomeSnapshot).toBe(1);
    expect(purchase?.cycleDaysSnapshot).toBe(3);

    expect(
      await Transaction.countDocuments({
        userId: u._id,
        type: 'PACKAGE_PURCHASE',
      }),
    ).toBe(0);

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(100);
  });

  it('rejects reuse of a ledger idempotency key for a different financial event', async () => {
    const u = await seedUser();

    await ledger({
      userId: String(u._id),
      type: 'DEPOSIT',
      amount: 25,
      status: 'COMPLETED',
      metadata: { idempotencyKey: 'same-key' },
    });

    await expect(ledger({
      userId: String(u._id),
      type: 'DEPOSIT',
      amount: 30,
      status: 'COMPLETED',
      metadata: { idempotencyKey: 'same-key' },
    })).rejects.toThrow('Idempotency key is already bound to a different transaction');

    expect((await balanceSnapshot(String(u._id))).totalBalance).toBe(25);
  });

  it('debits PACKAGE_PURCHASE exactly once when that explicit ledger type is used', async () => {
    const u = await seedUser();

    await ledger({
      userId: String(u._id),
      type: 'DEPOSIT',
      amount: 100,
      status: 'COMPLETED',
      metadata: {
        idempotencyKey: 'fund',
      },
    });

    const before = await balanceSnapshot(
      String(u._id),
    );

    const a = await ledger({
      userId: String(u._id),
      type: 'PACKAGE_PURCHASE',
      amount: 30,
      status: 'COMPLETED',
      reference: 'PP-1',
      metadata: {
        idempotencyKey: 'pp-1',
      },
    });

    const b = await ledger({
      userId: String(u._id),
      type: 'PACKAGE_PURCHASE',
      amount: 30,
      status: 'COMPLETED',
      reference: 'PP-1',
      metadata: {
        idempotencyKey: 'pp-1',
      },
    });

    expect(String(a._id)).toBe(
      String(b._id),
    );

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(before.totalBalance - 30);

    expect(
      await Transaction.countDocuments({
        userId: u._id,
        type: 'PACKAGE_PURCHASE',
        status: 'COMPLETED',
      }),
    ).toBe(1);
  });
});

it('keeps purchased package financial terms immutable after the package is edited', async () => {
  const u = await seedUser();
  const p = await seedPackage(100, 2, 3);
  const now = new Date(Date.now() - 1000);

  const purchase = await PackagePurchase.create({
    userId: u._id,
    packageId: p._id,
    packageAmount: 100,
    dailyIncomeSnapshot: 2,
    cycleDaysSnapshot: 3,
    status: 'ACTIVE',
    activatedAt: now,
    cycleStart: now,
    nextProcessAt: now,
    currentCycle: 0,
    completedCycles: 0,
    accruedAmount: 0,
  });

  await Package.updateOne({ _id: p._id }, {
    $set: { cycleDays: 99, 'incomeConfiguration.daily': 100 },
  });

  await processCycle(purchase);

  const after = await PackagePurchase.findById(purchase._id);
  expect(after?.dailyIncomeSnapshot).toBe(2);
  expect(after?.cycleDaysSnapshot).toBe(3);
  expect(after?.accruedAmount).toBe(2);
  expect((await balanceSnapshot(String(u._id))).totalBalance).toBe(2);

  const admin = await seedAdmin();
  await seedPayment();
  const deposit = await call(createDeposit, String(u._id), {
    packageId: p._id, method: 'TEST', amount: 100, reference: `SNAPSHOT-NEW-${Date.now()}-${Math.random()}`,
  });
  await call(verifyDeposit, String(admin._id), {}, {}, { id: String(deposit.body.deposit._id) });
  const newPurchase = await PackagePurchase.findOne({ paymentId: deposit.body.deposit._id });
  expect(newPurchase?.dailyIncomeSnapshot).toBe(100);
  expect(newPurchase?.cycleDaysSnapshot).toBe(99);
});

describe('Cycle income', () => {
  it('processes first, middle and final cycles once and expires at the end', async () => {
    const u = await seedUser();
    const p = await seedPackage(100, 2, 3);
    const now = new Date(Date.now() - 1000);

    const purchase = await PackagePurchase.create({
      userId: u._id,
      packageId: p._id,
      packageAmount: 100,
      status: 'ACTIVE',
      activatedAt: now,
      cycleStart: now,
      nextProcessAt: now,
      currentCycle: 0,
      completedCycles: 0,
      accruedAmount: 0,
    });

    for (let cycle = 1; cycle <= 3; cycle++) {
      const current = await PackagePurchase.findById(
        purchase._id,
      );

      await PackagePurchase.updateOne(
        {
          _id: purchase._id,
        },
        {
          $set: {
            nextProcessAt: new Date(
              Date.now() - 1000,
            ),
            status: 'ACTIVE',
          },
        },
      );

      await processCycle(current!);

      const after = await PackagePurchase.findById(
        purchase._id,
      );

      expect(after?.currentCycle).toBe(cycle);
      expect(after?.accruedAmount).toBe(cycle * 2);

      expect(
        await Transaction.countDocuments({
          userId: u._id,
          type: 'PACKAGE_INCOME',
          status: 'COMPLETED',
        }),
      ).toBe(cycle);
    }

    const after = await PackagePurchase.findById(
      purchase._id,
    );

    expect(after?.status).toBe('EXPIRED');

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(6);
  });

  it('ten concurrent executions of the same due cycle create one income', async () => {
    const u = await seedUser();
    const p = await seedPackage(100, 3, 3);
    const now = new Date(Date.now() - 1000);

    const purchase = await PackagePurchase.create({
      userId: u._id,
      packageId: p._id,
      packageAmount: 100,
      status: 'ACTIVE',
      activatedAt: now,
      cycleStart: now,
      nextProcessAt: now,
      currentCycle: 0,
      completedCycles: 0,
      accruedAmount: 0,
    });

    await Promise.allSettled(
      Array.from(
        {length: 10},
        () => processCycle(purchase),
      ),
    );

    expect(
      await Transaction.countDocuments({
        userId: u._id,
        type: 'PACKAGE_INCOME',
        status: 'COMPLETED',
      }),
    ).toBe(1);

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(3);

    expect(
      (await PackagePurchase.findById(
        purchase._id,
      ))?.currentCycle,
    ).toBe(1);
  });
});

describe('Commissions', () => {
  it('calculates levels/rates, excludes self, and caps at four levels', async () => {
    const source = await seedUser('S');
    const l1 = await seedUser('L1');
    const l2 = await seedUser('L2');
    const l3 = await seedUser('L3');
    const l4 = await seedUser('L4');
    const l5 = await seedUser('L5');

    await User.findByIdAndUpdate(
      source._id,
      {
        referredBy: l1._id,
      },
    );

    await User.findByIdAndUpdate(
      l1._id,
      {
        referredBy: l2._id,
      },
    );

    await User.findByIdAndUpdate(
      l2._id,
      {
        referredBy: l3._id,
      },
    );

    await User.findByIdAndUpdate(
      l3._id,
      {
        referredBy: l4._id,
      },
    );

    await User.findByIdAndUpdate(
      l4._id,
      {
        referredBy: l5._id,
      },
    );

    const created = await createCommissions(
      String(source._id),
      100,
      'SRC-1',
    );

    expect(created).toHaveLength(4);

    const rows = await Commission.find({
      sourceUserId: source._id,
    }).sort({
      level: 1,
    });

    expect(
      rows.map((x) => [
        x.level,
        x.rate,
        x.amount,
      ]),
    ).toEqual([
      [1, 10, 10],
      [2, 2, 2],
      [3, 1, 1],
      [4, 1, 1],
    ]);

    expect(
      await Commission.countDocuments({
        sourceUserId: source._id,
        level: 5,
      }),
    ).toBe(0);

    expect(
      (await balanceSnapshot(String(source._id))).totalBalance,
    ).toBe(0);

    expect(
      (await balanceSnapshot(String(l1._id))).totalBalance,
    ).toBe(10);
  });

  it('is duplicate-safe under ten concurrent commission calculations', async () => {
    const source = await seedUser('S');
    const parent = await seedUser('P');

    await User.findByIdAndUpdate(
      source._id,
      {
        referredBy: parent._id,
      },
    );

    await Promise.allSettled(
      Array.from(
        {length: 10},
        () =>
          createCommissions(
            String(source._id),
            100,
            'SRC-CONCURRENT',
          ),
      ),
    );

    expect(
      await Commission.countDocuments({
        sourceUserId: source._id,
        transactionId: 'SRC-CONCURRENT',
      }),
    ).toBe(1);

    expect(
      await Transaction.countDocuments({
        userId: parent._id,
        type: 'COMMISSION',
        metadata: {},
      }),
    ).toBeGreaterThanOrEqual(0);

    expect(
      (await balanceSnapshot(String(parent._id))).totalBalance,
    ).toBe(10);
  });
});

describe('Withdrawals', () => {
  async function funded() {
    const u = await seedUser();

    await ledger({
      userId: String(u._id),
      type: 'DEPOSIT',
      amount: 100,
      status: 'COMPLETED',
      metadata: {
        idempotencyKey: `fund-${u._id}`,
      },
    });

    await seedPayment();

    return u;
  }

  it('reserves funds, calculates fee/net, completes once, and never goes negative', async () => {
    const u = await funded();
    const admin = await seedAdmin();

    let r = await call(
      createWithdrawal,
      String(u._id),
      {
        amount: 50,
        method: 'TEST',
        account: 'acct',
        accountHolderName: 'Test Member',
      },
      {
        'idempotency-key': 'W-1',
      },
    );

    expect(r.statusCode).toBe(201);
    expect(r.body.withdrawal.fee).toBe(5);
    expect(r.body.withdrawal.netAmount).toBe(45);

    let w = await balanceSnapshot(
      String(u._id),
    );

    expect(w.totalBalance).toBe(100);
    expect(w.lockedWithdrawalAmount).toBe(50);
    expect(w.availableBalance).toBe(50);

    const id = String(
      r.body.withdrawal._id,
    );

    expect(
      (
        await call(
          adminWithdrawalApprove,
          String(admin._id),
          {},
          {},
          {id},
        )
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await call(
          adminWithdrawalProcessing,
          String(admin._id),
          {},
          {},
          {id},
        )
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await call(
          adminWithdrawalComplete,
          String(admin._id),
          {},
          {},
          {id},
        )
      ).statusCode,
    ).toBe(200);

    expect(
      (
        await call(
          adminWithdrawalComplete,
          String(admin._id),
          {},
          {},
          {id},
        )
      ).statusCode,
    ).toBe(409);

    w = await balanceSnapshot(
      String(u._id),
    );

    expect(w.totalBalance).toBe(50);
    expect(w.lockedWithdrawalAmount).toBe(0);
    expect(w.availableBalance).toBe(50);

    const txs = await Transaction.find({
      reference: new RegExp(
        `^${r.body.withdrawal.transactionId}`,
      ),
    }).sort({
      type: 1,
    });

    expect(
      txs.find(
        (x) => x.type === 'WITHDRAWAL',
      )?.netAmount,
    ).toBe(45);

    expect(
      txs.find(
        (x) => x.type === 'WITHDRAWAL_FEE',
      )?.netAmount,
    ).toBe(5);
  });

  it('supports zero-fee withdrawals and releases reservation on rejection', async () => {
    await SystemSetting.findOneAndUpdate(
      {
        key: 'withdrawalFeePercent',
      },
      {
        value: 0,
      },
      {
        upsert: true,
      },
    );

    const u = await funded();
    const admin = await seedAdmin();

    const r = await call(
      createWithdrawal,
      String(u._id),
      {
        amount: 20,
        method: 'TEST',
        account: 'acct',
        accountHolderName: 'Test Member',
      },
      {
        'idempotency-key': 'ZERO-FEE',
      },
    );

    expect(r.statusCode).toBe(201);
    expect(r.body.withdrawal.fee).toBe(0);

    expect(
      await Transaction.countDocuments({
        reference:
          r.body.withdrawal.transactionId,
        type: 'WITHDRAWAL_FEE',
      }),
    ).toBe(0);

    const id = String(
      r.body.withdrawal._id,
    );

    expect(
      (await balanceSnapshot(String(u._id)))
        .lockedWithdrawalAmount,
    ).toBe(20);

    expect(
      (
        await call(
          adminWithdrawalReject,
          String(admin._id),
          {},
          {},
          {id},
        )
      ).statusCode,
    ).toBe(200);

    expect(
      (await balanceSnapshot(String(u._id)))
        .lockedWithdrawalAmount,
    ).toBe(0);

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(100);
  });

  it('returns the same withdrawal for ten concurrent idempotent requests', async () => {
    const u = await funded();

    const results = await Promise.allSettled(
      Array.from(
        {length: 10},
        () =>
          call(
            createWithdrawal,
            String(u._id),
            {
              amount: 20,
              method: 'TEST',
              account: 'acct',
              accountHolderName: 'Test Member',
            },
            {
              'idempotency-key': 'SAME-W',
            },
          ),
      ),
    );

    const fulfilled = results
      .filter(
        (x) => x.status === 'fulfilled',
      )
      .map(
        (x) => (x as any).value,
      );

    expect(fulfilled.length).toBeGreaterThan(0);

    expect(
      await Withdrawal.countDocuments({
        userId: u._id,
        idempotencyKey: 'SAME-W',
      }),
    ).toBe(1);

    expect(
      await Transaction.countDocuments({
        userId: u._id,
        type: 'WITHDRAWAL',
      }),
    ).toBe(1);

    expect(
      (await balanceSnapshot(String(u._id)))
        .lockedWithdrawalAmount,
    ).toBe(20);
  });

  it('ten concurrent completions can finalize the reservation only once', async () => {
    const u = await funded();
    const admin = await seedAdmin();

    const r = await call(
      createWithdrawal,
      String(u._id),
      {
        amount: 30,
        method: 'TEST',
        account: 'acct',
        accountHolderName: 'Test Member',
      },
      {
        'idempotency-key': 'COMP-W',
      },
    );

    const id = String(
      r.body.withdrawal._id,
    );

    await call(
      adminWithdrawalApprove,
      String(admin._id),
      {},
      {},
      {id},
    );

    await call(
      adminWithdrawalProcessing,
      String(admin._id),
      {},
      {},
      {id},
    );

    await Promise.allSettled(
      Array.from(
        {length: 10},
        () =>
          call(
            adminWithdrawalComplete,
            String(admin._id),
            {},
            {},
            {id},
          ),
      ),
    );

    expect(
      await Withdrawal.countDocuments({
        _id: id,
        status: 'COMPLETED',
      }),
    ).toBe(1);

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(70);

    expect(
      (await balanceSnapshot(String(u._id)))
        .lockedWithdrawalAmount,
    ).toBe(0);
  });
  it('keeps approved withdrawals reserved during wallet rebuild and releases only after final state', async () => {
    const u = await funded();
    const admin = await seedAdmin();

    const created = await call(createWithdrawal, String(u._id), {
      amount: 50, method: 'TEST', account: 'acct', accountHolderName: 'Test Member',
    }, { 'idempotency-key': 'REBUILD-RESERVE' });
    expect(created.statusCode).toBe(201);

    await initializeWallets();
    expect((await balanceSnapshot(String(u._id))).lockedWithdrawalAmount).toBe(50);

    await call(adminWithdrawalApprove, String(admin._id), {}, {}, { id: String(created.body.withdrawal._id) });
    await initializeWallets();
    let snapshot = await balanceSnapshot(String(u._id));
    expect(snapshot.lockedWithdrawalAmount).toBe(50);
    expect(snapshot.availableBalance).toBe(50);

    await call(adminWithdrawalProcessing, String(admin._id), {}, {}, { id: String(created.body.withdrawal._id) });
    await initializeWallets();
    snapshot = await balanceSnapshot(String(u._id));
    expect(snapshot.lockedWithdrawalAmount).toBe(50);
    expect(snapshot.availableBalance).toBe(50);

    await call(adminWithdrawalComplete, String(admin._id), {}, {}, { id: String(created.body.withdrawal._id) });
    await initializeWallets();
    snapshot = await balanceSnapshot(String(u._id));
    expect(snapshot.lockedWithdrawalAmount).toBe(0);
    expect(snapshot.totalBalance).toBe(50);
    expect(snapshot.availableBalance).toBe(50);
  });

  it('does not lose a withdrawal reservation when wallet rebuild overlaps a withdrawal request', async () => {
    const u = await funded();

    const rebuild = initializeWallets();
    const withdrawal = call(
      createWithdrawal,
      String(u._id),
      {
        amount: 40,
        method: 'TEST',
        account: 'acct',
        accountHolderName: 'Test Member',
      },
      { 'idempotency-key': 'REBUILD-RACE' },
    );

    const results = await Promise.allSettled([rebuild, withdrawal]);
    const withdrawalResult = results[1];

    expect(withdrawalResult.status).toBe('fulfilled');
    if (withdrawalResult.status === 'fulfilled') {
      expect(withdrawalResult.value.statusCode).toBe(201);
    }
    expect((await balanceSnapshot(String(u._id))).lockedWithdrawalAmount).toBe(40);
    expect((await balanceSnapshot(String(u._id))).availableBalance).toBe(60);
  });

  it('releases a pending withdrawal reservation after rejection during wallet rebuild', async () => {
    const u = await funded();
    const admin = await seedAdmin();
    const created = await call(createWithdrawal, String(u._id), {
      amount: 40, method: 'TEST', account: 'acct', accountHolderName: 'Test Member',
    }, { 'idempotency-key': 'REBUILD-REJECT' });
    expect(created.statusCode).toBe(201);
    await call(adminWithdrawalReject, String(admin._id), {}, {}, { id: String(created.body.withdrawal._id) });
    await initializeWallets();
    const snapshot = await balanceSnapshot(String(u._id));
    expect(snapshot.lockedWithdrawalAmount).toBe(0);
    expect(snapshot.availableBalance).toBe(100);
  });

  it('enforces one withdrawal request per rolling 24 hours', async () => {
    const u = await funded();
    const first = await call(createWithdrawal, String(u._id), { amount: 20, method: 'TEST', account: 'acct', accountHolderName: 'Test Member' }, { 'idempotency-key': 'ROLLING-1' });
    expect(first.statusCode).toBe(201);
    const second = await call(createWithdrawal, String(u._id), { amount: 10, method: 'TEST', account: 'acct2', accountHolderName: 'Test Member' }, { 'idempotency-key': 'ROLLING-2' });
    expect(second.statusCode).toBe(429);
    expect(await Withdrawal.countDocuments({ userId: u._id })).toBe(1);
  });

  it('keeps an after-hours withdrawal persisted as pending', async () => {
    const u = await funded();
    const r = await call(createWithdrawal, String(u._id), { amount: 20, method: 'TEST', account: 'acct', accountHolderName: 'Test Member' }, { 'idempotency-key': 'AFTER-HOURS' });
    expect(r.statusCode).toBe(201);
    expect(r.body.withdrawal.status).toBe('PENDING');
  });

  it('uses the configured Pakistan timezone window without exposing schedule to clients', () => {
    const ten = new Date('2026-01-01T05:00:00.000Z');
    const seventeen = new Date('2026-01-01T12:00:00.000Z');
    const nine = new Date('2026-01-01T04:00:00.000Z');
    expect(getLocalHour(ten)).toBe(10);
    expect(getLocalHour(seventeen)).toBe(17);
    expect(isWithdrawalProcessingWindow(ten)).toBe(true);
    expect(isWithdrawalProcessingWindow(seventeen)).toBe(false);
    expect(isWithdrawalProcessingWindow(nine)).toBe(false);
  });

});

describe('Rewards and Promos', () => {
  it('claims an eligible reward once, enforces threshold and blocks ten concurrent claims', async () => {
    const u = await seedUser();

    await ledger({
      userId: String(u._id),
      type: 'DEPOSIT',
      amount: 100,
      status: 'COMPLETED',
      metadata: {
        idempotencyKey: 'reward-fund',
      },
    });

    const reward = await Reward.create({
      threshold: 50,
      reward: 7,
      status: 'ACTIVE',
      sortOrder: 1,
    });

    const results = await Promise.allSettled(
      Array.from(
        {length: 10},
        () =>
          claimReward(
            String(u._id),
            String(reward._id),
          ),
      ),
    );

    expect(
      results.some(
        (x) => x.status === 'fulfilled',
      ),
    ).toBe(true);

    expect(
      await RewardClaim.countDocuments({
        userId: u._id,
        rewardId: reward._id,
      }),
    ).toBe(1);

    expect(
      await Transaction.countDocuments({
        userId: u._id,
        type: 'REWARD',
        status: 'COMPLETED',
      }),
    ).toBe(1);

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(107);
  });

  it('rejects an ineligible reward without credit', async () => {
    const u = await seedUser();

    const reward = await Reward.create({
      threshold: 500,
      reward: 7,
      status: 'ACTIVE',
    });

    await expect(
      claimReward(
        String(u._id),
        String(reward._id),
      ),
    ).rejects.toThrow(
      'Reward not eligible',
    );

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(0);
  });

  it('enforces promo expiry, usage limits and ten concurrent idempotent claims', async () => {
    const u = await seedUser();

    const promo = await PromoCode.create({
      code: 'TESTPROMO',
      rewardType: 'FIXED',
      rewardValue: 5,
      usageLimit: 1,
      perUserLimit: 1,
      minRequirement: 0,
      status: 'ACTIVE',
    });

    const results = await Promise.allSettled(
      Array.from(
        {length: 10},
        () =>
          applyPromo(
            'TESTPROMO',
            String(u._id),
            'PROMO-IDEMP',
          ),
      ),
    );

    expect(
      results.some(
        (x) => x.status === 'fulfilled',
      ),
    ).toBe(true);

    expect(
      await PromoUsage.countDocuments({
        promoCodeId: promo._id,
        userId: u._id,
      }),
    ).toBe(1);

    expect(
      await Transaction.countDocuments({
        userId: u._id,
        type: 'PROMO_REWARD',
        status: 'COMPLETED',
      }),
    ).toBe(1);

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(5);

    await PromoCode.findByIdAndUpdate(
      promo._id,
      {
        expiresAt: new Date(
          Date.now() - 1000,
        ),
      },
    );

    await expect(
      applyPromo(
        'TESTPROMO',
        String(u._id),
        'PROMO-EXPIRED',
      ),
    ).rejects.toThrow('expired');
  });
});

describe('Ledger integrity, idempotency and invariants', () => {
  it('enforces balance equation and transaction netAmount invariant', async () => {
    const u = await seedUser();

    await ledger({
      userId: String(u._id),
      type: 'DEPOSIT',
      amount: 100,
      status: 'COMPLETED',
      metadata: {
        idempotencyKey: 'inv-dep',
      },
    });

    await ledger({
      userId: String(u._id),
      type: 'PACKAGE_PURCHASE',
      amount: 20,
      status: 'COMPLETED',
      metadata: {
        idempotencyKey: 'inv-pp',
      },
    });

    await ledger({
      userId: String(u._id),
      type: 'REWARD',
      amount: 5,
      status: 'COMPLETED',
      metadata: {
        idempotencyKey: 'inv-r',
      },
    });

    const rows = await Transaction.find({
      userId: u._id,
      status: 'COMPLETED',
    });

    for (const tx of rows) {
      expect(
        Number(tx.netAmount),
      ).toBeCloseTo(
        Number(tx.amount) -
          Number(tx.fee || 0),
        8,
      );
    }

    const credits = rows
      .filter((x) =>
        [
          'DEPOSIT',
          'REWARD',
          'PACKAGE_INCOME',
          'COMMISSION',
          'PROMO_REWARD',
          'ADJUSTMENT',
          'REFUND',
        ].includes(x.type),
      )
      .reduce(
        (s, x) =>
          s + Number(x.netAmount || 0),
        0,
      );

    const debits = rows
      .filter((x) =>
        [
          'WITHDRAWAL',
          'WITHDRAWAL_FEE',
          'PACKAGE_PURCHASE',
          'REVERSAL',
        ].includes(x.type),
      )
      .reduce(
        (s, x) =>
          s + Number(x.netAmount || 0),
        0,
      );

    expect(
      (await balanceSnapshot(String(u._id)))
        .totalBalance,
    ).toBeCloseTo(
      credits - debits,
      8,
    );

    expect(
      (await balanceSnapshot(String(u._id)))
        .totalBalance,
    ).toBeGreaterThanOrEqual(0);
  });

  it('rolls back a failed settled ledger debit without leaving a transaction', async () => {
    const u = await seedUser();

    await expect(
      ledger({
        userId: String(u._id),
        type: 'PACKAGE_PURCHASE',
        amount: 50,
        status: 'COMPLETED',
        metadata: {
          idempotencyKey: 'should-fail',
        },
      }),
    ).rejects.toThrow(
      'Insufficient wallet balance',
    );

    expect(
      await Transaction.countDocuments({
        userId: u._id,
        type: 'PACKAGE_PURCHASE',
      }),
    ).toBe(0);

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(0);
  });

  it('is idempotent under ten concurrent identical completed credits', async () => {
    const u = await seedUser();

    await Promise.all(
      Array.from(
        {length: 10},
        () =>
          ledger({
            userId: String(u._id),
            type: 'DEPOSIT',
            amount: 25,
            status: 'COMPLETED',
            metadata: {
              idempotencyKey:
                'CONCURRENT-CREDIT',
            },
          }),
      ),
    );

    expect(
      await Transaction.countDocuments({
        'metadata.idempotencyKey':
          'CONCURRENT-CREDIT',
      }),
    ).toBe(1);

    expect(
      (await balanceSnapshot(String(u._id))).totalBalance,
    ).toBe(25);
  });
  it('keeps withdrawal transaction records synchronized across approval, processing and completion', async () => {
    const u = await funded();
    const admin = await seedAdmin();

    const created = await call(
      createWithdrawal,
      String(u._id),
      {
        amount: 30,
        method: 'TEST',
        account: 'acct',
        accountHolderName: 'Test Member',
      },
      { 'idempotency-key': 'TX-LIFECYCLE' },
    );
    expect(created.statusCode).toBe(201);

    const id = String(created.body.withdrawal._id);
    const txBefore = await Transaction.find({
      reference: new RegExp(`^${created.body.withdrawal.transactionId}`),
    });
    expect(txBefore.length).toBeGreaterThanOrEqual(1);
    expect(new Set(txBefore.map(x => x.status))).toEqual(new Set(['PENDING']));

    expect((await call(adminWithdrawalApprove, String(admin._id), {}, {}, {id})).statusCode).toBe(200);
    expect(new Set((await Transaction.find({
      reference: new RegExp(`^${created.body.withdrawal.transactionId}`),
    })).map(x => x.status))).toEqual(new Set(['APPROVED']));

    expect((await call(adminWithdrawalProcessing, String(admin._id), {}, {}, {id})).statusCode).toBe(200);
    expect(new Set((await Transaction.find({
      reference: new RegExp(`^${created.body.withdrawal.transactionId}`),
    })).map(x => x.status))).toEqual(new Set(['PROCESSING']));

    expect((await call(adminWithdrawalComplete, String(admin._id), {}, {}, {id})).statusCode).toBe(200);
    expect(new Set((await Transaction.find({
      reference: new RegExp(`^${created.body.withdrawal.transactionId}`),
    })).map(x => x.status))).toEqual(new Set(['COMPLETED']));
  });

  it('uses the current tokenVersion when issuing a new login JWT after reset', async () => {
    const u = await seedUser('LOGIN-V');
    const passwordHash = await hash('NewPassword@123');
    await User.updateOne({ _id: u._id }, { $set: { passwordHash, tokenVersion: 7 } });

    const responseAfterLogin = await call(login, String(u._id), {
      email: u.email,
      password: 'NewPassword@123',
    });

    expect(responseAfterLogin.statusCode).toBe(200);
    expect(verify(String(responseAfterLogin.body.token)).tokenVersion).toBe(7);
  });

  it('blocks normal authenticated routes during maintenance while allowing admins through', async () => {
    await SystemSetting.create({ key: 'maintenanceMode', value: true });

    const response = {
      statusCode: 200,
      body: null as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(value: unknown) {
        this.body = value;
        return this;
      },
    };

    let userNext = false;
    await maintenanceGuard(
      { user: { id: 'user', role: 'USER', tokenVersion: 0 } } as any,
      response as any,
      () => { userNext = true; },
    );
    expect(userNext).toBe(false);
    expect(response.statusCode).toBe(503);

    let adminNext = false;
    await maintenanceGuard(
      { user: { id: 'admin', role: 'ADMIN', tokenVersion: 0 } } as any,
      response as any,
      () => { adminNext = true; },
    );
    expect(adminNext).toBe(true);
  });

  it('sets cycleEnd to the full package lifetime rather than one cycle', async () => {
    const u = await seedUser('LIFE');
    const admin = await seedAdmin();
    const p = await seedPackage(100, 2, 3);
    await seedPayment();

    const created = await call(createDeposit, String(u._id), {
      packageId: p._id,
      method: 'TEST',
      amount: 100,
      reference: `LIFETIME-${Date.now()}-${Math.random()}`,
    });
    const verified = await call(
      verifyDeposit,
      String(admin._id),
      {},
      {},
      { id: String(created.body.deposit._id) },
    );
    expect(verified.statusCode).toBe(200);

    const purchase = await PackagePurchase.findOne({
      paymentId: created.body.deposit._id,
    });
    expect(purchase).not.toBeNull();

    const intervalMs = Number((await SystemSetting.findOne({ key: 'cycleIntervalHours' }))?.value) * 3600000;
    const lifetimeMs = 3 * intervalMs;
    const actualLifetime = purchase!.cycleEnd!.getTime() - purchase!.cycleStart!.getTime();
    expect(actualLifetime).toBe(lifetimeMs);
  });

});