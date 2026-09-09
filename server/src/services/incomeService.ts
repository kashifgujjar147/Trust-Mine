import {
  PackagePurchase,
  Package,
  Transaction,
} from '../models/index.js';

import {
  ledger,
  withMongoTransaction,
} from './ledger.js';

import { createCommissions } from './referralService.js';
import { getSettings } from './settingsService.js';

export async function processCycle(p: { _id: unknown }) {
  const settings = await getSettings();

  const intervalMs =
    Math.max(
      1,
      Number(settings.cycleIntervalHours || 24)
    ) * 3600000;

  const durationFallback = Math.max(
    1,
    Number(settings.packageDurationDays || 365)
  );

  const now = new Date();

  const work = async (session: any) => {
    const current = await PackagePurchase
      .findOne({
        _id: p._id,
        status: 'ACTIVE',
        nextProcessAt: { $lte: now },
      })
      .populate('packageId')
      .session(session);

    if (!current) return null;

    const pkg =
      current.packageId &&
      typeof current.packageId === 'object'
        ? current.packageId
        : await Package.findById(current.packageId).session(session);

    if (!pkg) return null;

    const duration = Math.max(
      1,
      Number(
        (pkg as any).cycleDays || durationFallback
      )
    );

    const cycleNumber =
      Number(current.currentCycle || 0) + 1;

    if (cycleNumber > duration) {
      current.status = 'EXPIRED';
      current.nextProcessAt = undefined;

      await current.save({ session });

      return null;
    }

    const dailyAmount = Number(
      (pkg as any).incomeConfiguration?.daily || 0
    );

    const key = `${current._id}:${cycleNumber}`;

    let income =
      dailyAmount > 0
        ? await Transaction.findOne({
            'metadata.idempotencyKey': key,
            status: 'COMPLETED',
          }).session(session)
        : null;

    if (dailyAmount > 0 && !income) {
      income = await ledger(
        {
          userId: String(current.userId),
          type: 'PACKAGE_INCOME',
          amount: dailyAmount,
          status: 'COMPLETED',
          description: `Package income cycle ${cycleNumber}`,
          metadata: {
            packagePurchaseId: String(current._id),
            cycle: cycleNumber,
            idempotencyKey: key,
          },
        },
        session
      );
    }

    const advanced =
      await PackagePurchase.findOneAndUpdate(
        {
          _id: current._id,
          status: 'ACTIVE',
          currentCycle: cycleNumber - 1,
          nextProcessAt: { $lte: now },
        },
        {
          $set: {
            lastProcessedAt: now,
            nextProcessAt: new Date(
              now.getTime() + intervalMs
            ),
          },
          $inc: {
            currentCycle: 1,
            completedCycles: 1,
            accruedAmount: Number(
              income?.amount || 0
            ),
          },
        },
        {
          new: true,
          session,
        }
      );

    if (!advanced) return current;

    if (income) {
      await createCommissions(
        String(advanced.userId),
        Number(income.amount || 0),
        String(income.transactionId ?? ''),
        session
      );
    }

    if (cycleNumber >= duration) {
      advanced.status = 'EXPIRED';
      advanced.nextProcessAt = undefined;

      await advanced.save({ session });
    }

    return advanced;
  };

  return withMongoTransaction(
    work,
    async () => {
      const current = await PackagePurchase
        .findOne({
          _id: p._id,
          status: 'ACTIVE',
          nextProcessAt: { $lte: now },
        })
        .populate('packageId');

      if (!current) return null;

      const pkg =
        current.packageId &&
        typeof current.packageId === 'object'
          ? current.packageId
          : await Package.findById(current.packageId);

      if (!pkg) return null;

      const duration = Math.max(
        1,
        Number(
          (pkg as any).cycleDays || durationFallback
        )
      );

      const cycleNumber =
        Number(current.currentCycle || 0) + 1;

      if (cycleNumber > duration) {
        current.status = 'EXPIRED';
        current.nextProcessAt = undefined;

        await current.save();

        return null;
      }

      const dailyAmount = Number(
        (pkg as any).incomeConfiguration?.daily || 0
      );

      const key = `${current._id}:${cycleNumber}`;

      let income =
        dailyAmount > 0
          ? await Transaction.findOne({
              'metadata.idempotencyKey': key,
              status: 'COMPLETED',
            })
          : null;

      if (dailyAmount > 0 && !income) {
        income = await ledger({
          userId: String(current.userId),
          type: 'PACKAGE_INCOME',
          amount: dailyAmount,
          status: 'COMPLETED',
          description: `Package income cycle ${cycleNumber}`,
          metadata: {
            packagePurchaseId: String(current._id),
            cycle: cycleNumber,
            idempotencyKey: key,
          },
        });
      }

      const advanced =
        await PackagePurchase.findOneAndUpdate(
          {
            _id: current._id,
            status: 'ACTIVE',
            currentCycle: cycleNumber - 1,
            nextProcessAt: { $lte: now },
          },
          {
            $set: {
              lastProcessedAt: now,
              nextProcessAt: new Date(
                now.getTime() + intervalMs
              ),
            },
            $inc: {
              currentCycle: 1,
              completedCycles: 1,
              accruedAmount: Number(
                income?.amount || 0
              ),
            },
          },
          {
            new: true,
          }
        );

      if (!advanced) return current;

      if (income) {
        await createCommissions(
          String(advanced.userId),
          Number(income.amount || 0),
          String(income.transactionId ?? '')
        );
      }

      if (cycleNumber >= duration) {
        advanced.status = 'EXPIRED';
        advanced.nextProcessAt = undefined;

        await advanced.save();
      }

      return advanced;
    }
  );
}