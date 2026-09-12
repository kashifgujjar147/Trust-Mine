
import { Request, Response } from 'express';
import mongoose, {ClientSession} from 'mongoose';

import {
  Package,
  PaymentMethod,
  Deposit,
  PackagePurchase,
  Transaction,
  User,
  Withdrawal,
  Reward,
  PromoCode,
  Notification,
  SupportTicket,
  SupportMessage,
  AuditLog,
  SystemSetting,
  Wallet,
  Commission
} from '../models/index.js';

import { AuthedRequest } from '../middleware/auth.js';

import {
  ledger,
  txid,
  balanceSnapshot,
  reserveWithdrawal,
  releaseWithdrawal,
  finalizeWithdrawal,
  creditWallet,
  withMongoTransaction
} from '../services/ledger.js';

import {
  getSettings,
  setSetting
} from '../services/settingsService.js';

import {
  applyPromo,
  validatePromo
} from '../services/promoService.js';

import {
  eligibleRewards,
  claimReward
} from '../services/rewardService.js';

import {
  getUpline,
  createCommissions
} from '../services/referralService.js';

import { isWithdrawalProcessingWindow, claimWithdrawalSlot } from '../services/withdrawalPolicy.js';
import { sendTelegramNotification } from '../services/telegramService.js';
import { env } from '../config/env.js';


const sanitize = (
  value: unknown
): unknown => {

  if (Array.isArray(value)) {
    return value.map(sanitize);
  }

  if (
    value &&
    typeof value === 'object'
  ) {

    const out: Record<string, unknown> = {};

    for (
      const [k, v] of Object.entries(
        value as Record<string, unknown>
      )
    ) {

      if (
        /password|secret|private.?key|api.?key|token/i.test(k)
      ) {
        continue;
      }

      out[k] = sanitize(v);
    }

    return out;
  }

  return value;
};


function escapeRegex(
  value: string
): string {

  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&'
  );
}


async function audit(
  req: AuthedRequest,
  action: string,
  target: string,
  targetId: string,
  oldValue?: unknown,
  newValue?: unknown
) {

  if (req.user) {

    await AuditLog.create({
      adminId: req.user.id,
      action,
      target,
      targetId,
      oldValue: sanitize(oldValue),
      newValue: sanitize(newValue),
      ip: req.ip
    });
  }
}


/* =========================================================
   PUBLIC PACKAGE / PAYMENT METHODS
========================================================= */

export async function packages(
  _req: Request,
  res: Response
) {

  res.json({
    packages: await Package.find({
      status: 'ACTIVE'
    }).sort({
      sortOrder: 1
    })
  });
}


export async function packageById(
  req: Request,
  res: Response
) {

  if (
    !mongoose.isValidObjectId(
      req.params.id
    )
  ) {

    return res.status(404).json({
      message: 'Package not found'
    });
  }

  const p = await Package.findOne({
    _id: req.params.id,
    status: {
      $ne: 'ARCHIVED'
    }
  });

  if (!p) {

    return res.status(404).json({
      message: 'Package not found'
    });
  }

  res.json({
    package: p
  });
}


export async function methods(
  _req: Request,
  res: Response
) {

  res.json({
    methods: await PaymentMethod.find({
      status: 'ACTIVE'
    }).sort({
      displayOrder: 1
    })
  });
}


/* =========================================================
   USER DASHBOARD
========================================================= */

export async function dashboard(
  req: AuthedRequest,
  res: Response
) {

  const userId = req.user!.id;

  const oid = new mongoose.Types.ObjectId(
    userId
  );

  const [
    settings,
    wallet,
    activePackages,
    transactions,
    depAgg,
    withAgg,
    incomeAgg,
    todayAgg,
    commAgg,
    rewardAgg,
    pendingWith,
    team,
    purchases
  ] = await Promise.all([

    getSettings(),

    balanceSnapshot(
      userId
    ),

    PackagePurchase.countDocuments({
      userId,
      status: 'ACTIVE'
    }),

    Transaction.find({
      userId
    })
      .sort({
        createdAt: -1
      })
      .limit(20),

    Transaction.aggregate([
      {
        $match: {
          userId: oid,
          type: 'DEPOSIT',
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]),

    Transaction.aggregate([
      {
        $match: {
          userId: oid,
          type: 'WITHDRAWAL',
          status: {
            $in: [
              'APPROVED',
              'COMPLETED'
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]),

    Transaction.aggregate([
      {
        $match: {
          userId: oid,
          type: 'PACKAGE_INCOME',
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]),

    Transaction.aggregate([
      {
        $match: {
          userId: oid,
          type: 'PACKAGE_INCOME',
          status: 'COMPLETED',
          createdAt: {
            $gte: new Date(
              new Date().setHours(
                0,
                0,
                0,
                0
              )
            )
          }
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]),

    Transaction.aggregate([
      {
        $match: {
          userId: oid,
          type: 'COMMISSION',
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]),

    Transaction.aggregate([
      {
        $match: {
          userId: oid,
          type: {
            $in: [
              'REWARD',
              'PROMO_REWARD'
            ]
          },
          status: 'COMPLETED'
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]),

    Withdrawal.aggregate([
      {
        $match: {
          userId: oid,
          status: {
            $in: [
              'PENDING',
              'APPROVED',
              'PROCESSING'
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: '$amount'
          }
        }
      }
    ]),

    User.countDocuments({
      referredBy: userId
    }),

    PackagePurchase.find({
      userId,
      status: 'ACTIVE'
    }).populate(
      'packageId'
    )
  ]);

  res.json({

    balance:
      wallet.totalBalance,

    totalBalance:
      wallet.totalBalance,

    availableBalance:
      wallet.availableBalance,

    lockedWithdrawalAmount:
      wallet.lockedWithdrawalAmount,

  lockedPackageCapital:
    wallet.lockedPackageCapital,

    totalDeposit:
      depAgg[0]?.total || 0,

    totalWithdrawals:
      withAgg[0]?.total || 0,

    income:
      incomeAgg[0]?.total || 0,

    activePackages,

    todayIncome:
      todayAgg[0]?.total || 0,

    pendingWithdrawal:
      pendingWith[0]?.total || 0,

    team,

    commission:
      commAgg[0]?.total || 0,

    rewards:
      rewardAgg[0]?.total || 0,

    activePackagePurchases:
      purchases.map(
        (p: any) => {
          const intervalMs =
            Math.max(
              1,
              Number(settings.cycleIntervalHours || 24)
            ) * 3600000;
          const duration =
            Math.max(
              1,
              Number(
                p.cycleDaysSnapshot ||
                p.packageId?.cycleDays ||
                settings.packageDurationDays ||
                365
              )
            );
          const start =
            p.cycleStart
              ? new Date(p.cycleStart)
              : undefined;

          return {
            ...p.toObject(),
            cycleEnd:
              start
                ? new Date(
                    start.getTime() +
                    duration * intervalMs
                  )
                : p.cycleEnd,
            cycleDaysSnapshot:
              p.cycleDaysSnapshot ||
              p.packageId?.cycleDays ||
              undefined,
            packageName:
              p.packageId?.name ||
              'Package',
            packageId: String(
              p.packageId?._id ||
              p.packageId
            )
          };
        }
      ),

    transactions,

    settings
  });
}


/* =========================================================
   DEPOSITS
========================================================= */

export async function createDeposit(
  req: AuthedRequest,
  res: Response
) {

  try {

    const {
      packageId,
      method,
      amount,
      reference,
      proofUrl
    } = req.body;

    if (
      !mongoose.isValidObjectId(
        packageId
      )
    ) {

      return res.status(400).json({
        message: 'Invalid package'
      });
    }

    const settings =
      await getSettings();

    const n = Number(amount);

    if (
      !Number.isFinite(n) ||
      n <
        Number(
          settings.minimumDeposit
        )
    ) {

      return res.status(400).json({
        message:
          `Minimum deposit is ${settings.minimumDeposit}`
      });
    }

    const p =
      await Package.findOne({
        _id: packageId,
        status: 'ACTIVE'
      });

    if (
      !p ||
      n !== Number(p.amount)
    ) {

      return res.status(400).json({
        message:
          'Select a valid active package and exact package amount'
      });
    }

    const pm =
      await PaymentMethod.findOne({
        code: String(
          method
        ).trim(),
        status: 'ACTIVE'
      });

    if (
      !pm ||
      n < Number(
        pm.minAmount || 0
      )
    ) {

      return res.status(400).json({
        message:
          'Invalid payment method or amount'
      });
    }

    const ref =
      String(
        reference || ''
      ).trim();

    if (!ref) {

      return res.status(400).json({
        message:
          'Payment reference is required'
      });
    }

    const existing =
      await Deposit.findOne({
        reference: ref
      });

    if (existing) {

      return res.status(409).json({
        message:
          'Payment reference already exists',
        deposit: existing
      });
    }

    const work =
      async (
        session: ClientSession
      ) => {

        const d = (
          await Deposit.create(
            [{
              transactionId:
                txid('DEP'),

              userId:
                req.user!.id,

              packageId,

              amount: n,

              method:
                String(method).trim(),

              reference: ref,

              proofUrl,

              status: 'PENDING'
            }],
            {
              session
            }
          )
        )[0];

        await ledger(
          {
            userId:
              req.user!.id,

            type: 'DEPOSIT',

            amount: n,

            status: 'PENDING',

            reference:
              d.transactionId ??
              undefined,

            description:
              'Deposit awaiting verification',

            metadata: {
              depositId:
                String(d._id)
            }
          },
          session
        );

        return d;
      };

    const d =
      await withMongoTransaction(
        work,
        async () => {

          const existingFallback =
            await Deposit.findOne({
              reference: ref
            });

          if (
            existingFallback
          ) {

            const pendingLedger =
              await Transaction.findOne({
                reference:
                  existingFallback.transactionId,

                type: 'DEPOSIT'
              });

            if (!pendingLedger) {

              await ledger({
                userId:
                  String(
                    existingFallback.userId
                  ),

                type: 'DEPOSIT',

                amount:
                  existingFallback.amount,

                status: 'PENDING',

                reference:
                  existingFallback.transactionId ??
                  undefined,

                description:
                  'Deposit awaiting verification',

                metadata: {
                  depositId:
                    String(
                      existingFallback._id
                    )
                }
              });
            }

            return existingFallback;
          }

          let created: any;

          try {

            created =
              await Deposit.create({
                transactionId:
                  txid('DEP'),

                userId:
                  req.user!.id,

                packageId,

                amount: n,

                method:
                  String(method).trim(),

                reference: ref,

                proofUrl,

                status: 'PENDING'
              });

            await ledger({
              userId:
                req.user!.id,

              type: 'DEPOSIT',

              amount: n,

              status: 'PENDING',

              reference:
                created.transactionId ??
                undefined,

              description:
                'Deposit awaiting verification',

              metadata: {
                depositId:
                  String(
                    created._id
                  )
              }
            });

            return created;

          } catch (e: any) {

            if (created) {

              await Deposit.updateOne(
                {
                  _id:
                    created._id,

                  status:
                    'PENDING'
                },
                {
                  $set: {
                    status:
                      'FAILED'
                  }
                }
              );
            }

            if (
              e?.code === 11000
            ) {

              const prior =
                await Deposit.findOne({
                  reference: ref
                });

              if (prior) {
                return prior;
              }
            }

            throw e;
          }
        }
      );

    return res.status(201).json({
      message:
        'Deposit submitted for verification',

      deposit: d
    });

  } catch (e: any) {

    return res.status(
      e?.code === 11000
        ? 409
        : 400
    ).json({
      message:
        e?.message ||
        'Unable to create deposit'
    });
  }
}


export async function deposits(
  req: AuthedRequest,
  res: Response
) {

  const rows =
    await Deposit.find({
      userId:
        req.user!.id
    }).populate(
      'packageId',
      'name'
    );

  res.json({
    deposits:
      rows.map(
        d => ({
          ...d.toObject(),

          packageName:
            (d.packageId as any)?.name ||
            'Package',

          packageId:
            String(
              (d.packageId as any)?._id ||
              d.packageId
            )
        })
      )
  });
}


export async function depositDetails(
  req: AuthedRequest,
  res: Response
) {

  if (
    !mongoose.isValidObjectId(
      req.params.id
    )
  ) {

    return res.status(404).json({
      message:
        'Deposit not found'
    });
  }

  const d =
    await Deposit.findOne({
      _id: req.params.id,
      userId:
        req.user!.id
    });

  if (!d) {

    return res.status(404).json({
      message:
        'Deposit not found'
    });
  }

  res.json({
    deposit: d
  });
}


/* =========================================================
   VERIFY DEPOSIT
========================================================= */

export async function verifyDeposit(
  req: AuthedRequest,
  res: Response
) {

  const settings =
    await getSettings();

  const work =
    async (
      session: ClientSession
    ) => {

      const d =
        await Deposit.findOne({
          _id: req.params.id,

          status: {
            $in: [
              'PENDING',
              'PROCESSING'
            ]
          }
        }).session(session);

      if (!d) {

        const done =
          await Deposit.findById(
            req.params.id
          ).session(session);

        if (!done) {
          return null;
        }

        if (
          done.status ===
          'COMPLETED'
        ) {

          const existingTx =
            await Transaction.findOne({
              reference:
                done.transactionId,

              type: 'DEPOSIT'
            }).session(session);

          if (
            existingTx?.status ===
            'PENDING'
          ) {

            await Transaction.updateOne(
              {
                _id:
                  existingTx._id,

                status:
                  'PENDING'
              },
              {
                $set: {
                  status:
                    'COMPLETED'
                }
              },
              {
                session
              }
            );

            await creditWallet(
              String(done.userId),
              done.amount,
              session
            );

          } else if (!existingTx) {

            await ledger(
              {
                userId:
                  String(done.userId),

                type: 'DEPOSIT',

                amount:
                  done.amount,

                status:
                  'COMPLETED',

                reference:
                  `RECOVERED-${done.transactionId}`,

                metadata: {
                  depositId:
                    String(done._id),

                  idempotencyKey:
                    `deposit-recovery:${done._id}`
                }
              },
              session
            );

            // ledger(DEPOSIT, COMPLETED) is authoritative and
            // performs the single wallet credit. Never credit again here.
          }

          // Ensure referral commissions are also created for completed
          // deposits recovered through this idempotent path.
          // createCommissions() is idempotent, so existing commissions
          // will not be duplicated.
          await createCommissions(
            String(done.userId),
            Number(done.amount),
            String(done.transactionId),
            session
          );

          let purchase =
            await PackagePurchase.findOne({
              paymentId:
                done._id
            }).session(session);

          if (!purchase) {

            const now =
              new Date();

            const intervalMs =
              Math.max(
                1,
                Number(
                  settings.cycleIntervalHours ||
                  24
                )
              ) *
              3600000;

            const purchasedPackage =
              await Package.findById(done.packageId)
                .select('incomeConfiguration.daily cycleDays')
                .lean();

            if (!purchasedPackage) {
              throw new Error('Package not found during activation recovery');
            }

            const dailyIncomeSnapshot =
              Number(purchasedPackage.incomeConfiguration?.daily || 0);
            const cycleDaysSnapshot =
              Math.max(1, Number(purchasedPackage.cycleDays || 1));
            const lifetimeMs =
              cycleDaysSnapshot * intervalMs;

            purchase = (
              await PackagePurchase.create(
                [{
                  userId:
                    done.userId,

                  packageId:
                    done.packageId,

                  packageAmount:
                    done.amount,

                  dailyIncomeSnapshot,
                  cycleDaysSnapshot,

                  paymentId:
                    done._id,

                  status:
                    'ACTIVE',

                  activatedAt:
                    now,

                  cycleStart:
                    now,

                  cycleEnd:
                    new Date(
                      now.getTime() +
                      lifetimeMs
                    ),

                  nextProcessAt:
                    new Date(
                      now.getTime() +
                      intervalMs
                    ),

                  currentCycle:
                    0,

                  completedCycles:
                    0,

                  accruedAmount:
                    0
                }],
                {
                  session
                }
              )
            )[0];

            await Notification.create(
              [{
                userId:
                  done.userId,

                title:
                  'Package activated',

                message:
                  'Your package is now active after payment verification.',

                type:
                  'PACKAGE'
              }],
              {
                session
              }
            );
          }

          return {
            done,
            purchase,
            already: true
          };
        }

        throw Object.assign(
          new Error(
            'Deposit cannot be verified in its current state'
          ),
          {
            statusCode:
              409
          }
        );
      }

      const now =
        new Date();

      d.status =
        'COMPLETED';

      d.verifiedAt =
        now;

      d.verifiedBy =
        req.user!.id as any;

      await d.save({
        session
      });

      const updatedTx =
        await Transaction.findOneAndUpdate(
          {
            reference:
              d.transactionId,

            type:
              'DEPOSIT',

            status:
              'PENDING'
          },
          {
            $set: {
              status:
                'COMPLETED'
            }
          },
          {
            new: true,
            session
          }
        );

      if (!updatedTx) {

        throw Object.assign(
          new Error(
            'Deposit ledger entry is missing or already processed'
          ),
          {
            statusCode:
              409
          }
        );
      }

      await creditWallet(
        String(d.userId),
        d.amount,
        session
      );

      // Distribute referral commissions from the completed deposit.
      // Idempotency is handled inside createCommissions().
      await createCommissions(
        String(d.userId),
        Number(d.amount),
        String(d.transactionId),
        session
      );

      const intervalMs =
        Math.max(
          1,
          Number(
            settings.cycleIntervalHours ||
            24
          )
        ) *
        3600000;

      const purchasedPackage =
        await Package.findById(d.packageId)
          .select('incomeConfiguration.daily cycleDays')
          .lean();

      if (!purchasedPackage) {
        throw new Error('Package not found during activation');
      }

      const dailyIncomeSnapshot =
        Number(purchasedPackage.incomeConfiguration?.daily || 0);
      const cycleDaysSnapshot =
        Math.max(1, Number(purchasedPackage.cycleDays || 1));
      const lifetimeMs =
        cycleDaysSnapshot * intervalMs;

      let purchase =
        await PackagePurchase.findOne({
          paymentId:
            d._id
        }).session(session);

      if (!purchase) {

        purchase = (
          await PackagePurchase.create(
            [{
              userId:
                d.userId,

              packageId:
                d.packageId,

              packageAmount:
                d.amount,

              dailyIncomeSnapshot,
              cycleDaysSnapshot,

              paymentId:
                d._id,

              status:
                'ACTIVE',

              activatedAt:
                now,

              cycleStart:
                now,

              cycleEnd:
                new Date(
                  now.getTime() +
                  lifetimeMs
                ),

              lastProcessedAt:
                null,

              nextProcessAt:
                new Date(
                  now.getTime() +
                  intervalMs
                ),

              currentCycle:
                0,

              completedCycles:
                0,

              accruedAmount:
                0
            }],
            {
              session
            }
          )
        )[0];

        await Notification.create(
          [{
            userId:
              d.userId,

            title:
              'Package activated',

            message:
              'Your package is now active after payment verification.',

            type:
              'PACKAGE'
          }],
          {
            session
          }
        );
      }

      await AuditLog.create(
        [{
          adminId:
            req.user!.id,

          action:
            'VERIFY',

          target:
            'Deposit',

          targetId:
            String(d._id),

          oldValue: {
            status:
              'PENDING'
          },

          newValue: {
            status:
              'COMPLETED'
          },

          ip:
            req.ip
        }],
        {
          session
        }
      );

      return {
        done: d,
        purchase,
        already: false
      };
    };


  try {

    const result =
      await withMongoTransaction(
        work,
        async () => {

          const now =
            new Date();

          const d =
            await Deposit.findOneAndUpdate(
              {
                _id:
                  req.params.id,

                status: {
                  $in: [
                    'PENDING',
                    'PROCESSING'
                  ]
                }
              },
              {
                $set: {
                  status:
                    'COMPLETED',

                  verifiedAt:
                    now,

                  verifiedBy:
                    req.user!.id
                }
              },
              {
                new: true
              }
            );

          if (d) {

            const updatedTx =
              await Transaction.findOneAndUpdate(
                {
                  reference:
                    d.transactionId,

                  type:
                    'DEPOSIT',

                  status:
                    'PENDING'
                },
                {
                  $set: {
                    status:
                      'COMPLETED'
                  }
                },
                {
                  new: true
                }
              );

            if (!updatedTx) {

              throw Object.assign(
                new Error(
                  'Deposit ledger entry is missing or already processed'
                ),
                {
                  statusCode:
                    409
                }
              );
            }

            await creditWallet(
              String(d.userId),
              d.amount
            );

            const intervalMs =
              Math.max(
                1,
                Number(
                  settings.cycleIntervalHours ||
                  24
                )
              ) *
              3600000;

            const purchasedPackage =
              await Package.findById(d.packageId)
                .select('incomeConfiguration.daily cycleDays')
                .lean();

            if (!purchasedPackage) {
              throw new Error('Package not found during activation recovery');
            }

            const dailyIncomeSnapshot =
              Number(purchasedPackage.incomeConfiguration?.daily || 0);
            const cycleDaysSnapshot =
              Math.max(1, Number(purchasedPackage.cycleDays || 1));
            const lifetimeMs =
              cycleDaysSnapshot * intervalMs;

            let purchase =
              await PackagePurchase.findOne({
                paymentId:
                  d._id
              });

            if (!purchase) {

              try {

                purchase =
                  await PackagePurchase.create({
                    userId:
                      d.userId,

                    packageId:
                      d.packageId,

                    packageAmount:
                      d.amount,

                    dailyIncomeSnapshot,
                    cycleDaysSnapshot,

                    paymentId:
                      d._id,

                    status:
                      'ACTIVE',

                    activatedAt:
                      now,

                    cycleStart:
                      now,

                    cycleEnd:
                      new Date(
                        now.getTime() +
                        lifetimeMs
                      ),

                    nextProcessAt:
                      new Date(
                        now.getTime() +
                        intervalMs
                      ),

                    currentCycle:
                      0,

                    completedCycles:
                      0,

                    accruedAmount:
                      0
                  });

                await Notification.create({
                  userId:
                    d.userId,

                  title:
                    'Package activated',

                  message:
                    'Your package is now active after payment verification.',

                  type:
                    'PACKAGE'
                });

              } catch (e: any) {

                if (
                  e?.code !== 11000
                ) {
                  throw e;
                }

                purchase =
                  await PackagePurchase.findOne({
                    paymentId:
                      d._id
                  });
              }
            }

            await audit(
              req,
              'VERIFY',
              'Deposit',
              String(d._id),
              {
                status:
                  'PENDING'
              },
              {
                status:
                  'COMPLETED'
              }
            );

            return {
              done: d,
              purchase,
              already: false
            };
          }

          const done =
            await Deposit.findById(
              req.params.id
            );

          if (!done) {
            return null;
          }

          if (
            done.status !==
            'COMPLETED'
          ) {

            throw Object.assign(
              new Error(
                'Deposit cannot be verified in its current state'
              ),
              {
                statusCode:
                  409
              }
            );
          }

          const existingTx =
            await Transaction.findOne({
              reference:
                done.transactionId,

              type:
                'DEPOSIT'
            });

          if (
            existingTx?.status ===
            'PENDING'
          ) {

            const claimedTx =
              await Transaction.findOneAndUpdate(
                {
                  _id:
                    existingTx._id,

                  status:
                    'PENDING'
                },
                {
                  $set: {
                    status:
                      'COMPLETED'
                  }
                },
                {
                  new: true
                }
              );

            if (claimedTx) {

              await creditWallet(
                String(done.userId),
                done.amount
              );
            }

          } else if (!existingTx) {

            await ledger({
              userId:
                String(done.userId),

              type:
                'DEPOSIT',

              amount:
                done.amount,

              status:
                'COMPLETED',

              reference:
                `RECOVERED-${done.transactionId}`,

              metadata: {
                depositId:
                  String(done._id),

                idempotencyKey:
                  `deposit-recovery:${done._id}`
              }
            });

            // ledger(DEPOSIT, COMPLETED) performs the single wallet credit.
          }

          const intervalMs =
            Math.max(
              1,
              Number(
                settings.cycleIntervalHours ||
                24
              )
            ) *
            3600000;

          let purchase =
            await PackagePurchase.findOne({
              paymentId:
                done._id
            });

          if (!purchase) {

            const activatedAt =
              new Date();

            try {

              const purchasedPackage =
                await Package.findById(done.packageId).select('incomeConfiguration.daily cycleDays').lean();

              if (!purchasedPackage) {
                throw new Error('Package not found during activation');
              }

              purchase =
                await PackagePurchase.create({
                  userId:
                    done.userId,

                  packageId:
                    done.packageId,

                  packageAmount:
                    done.amount,

                  dailyIncomeSnapshot:
                    Number(purchasedPackage.incomeConfiguration?.daily || 0),

                  cycleDaysSnapshot:
                    Math.max(1, Number(purchasedPackage.cycleDays || 1)),

                  paymentId:
                    done._id,

                  status:
                    'ACTIVE',

                  activatedAt,

                  cycleStart:
                    activatedAt,

                  cycleEnd:
                    new Date(
                      activatedAt.getTime() +
                      Math.max(
                        1,
                        Number(purchasedPackage.cycleDays || 1)
                      ) * intervalMs
                    ),

                  nextProcessAt:
                    new Date(
                      activatedAt.getTime() +
                      intervalMs
                    ),

                  currentCycle:
                    0,

                  completedCycles:
                    0,

                  accruedAmount:
                    0
                });

              await Notification.create({
                userId:
                  done.userId,

                title:
                  'Package activated',

                message:
                  'Your package is now active after payment verification.',

                type:
                  'PACKAGE'
              });

            } catch (e: any) {

              if (
                e?.code !== 11000
              ) {
                throw e;
              }

              purchase =
                await PackagePurchase.findOne({
                  paymentId:
                    done._id
                });
            }
          }

          return {
            done,
            purchase,
            already: true
          };
        }
      );

    if (!result) {

      return res.status(404).json({
        message:
          'Deposit not found'
      });
    }

    return res.json({

      message:
        result.already
          ? 'Already completed'
          : 'Verified; package activated automatically',

      packagePurchase:
        result.purchase
    });

  } catch (e: any) {

    return res.status(
      e?.statusCode || 500
    ).json({
      message:
        e?.message ||
        'Deposit verification failed'
    });
  }
}


/* =========================================================
   WITHDRAWALS
========================================================= */

export async function withdrawals(
  req: AuthedRequest,
  res: Response
) {

  res.json({
    withdrawals:
      await Withdrawal.find({
        userId:
          req.user!.id
      }).sort({
        createdAt: -1
      })
  });
}


export async function withdrawalDetails(
  req: AuthedRequest,
  res: Response
) {

  if (
    !mongoose.isValidObjectId(
      req.params.id
    )
  ) {

    return res.status(404).json({
      message:
        'Withdrawal not found'
    });
  }

  const w =
    await Withdrawal.findOne({
      _id:
        req.params.id,

      userId:
        req.user!.id
    });

  if (!w) {

    return res.status(404).json({
      message:
        'Withdrawal not found'
    });
  }

  res.json({
    withdrawal: w
  });
}


/* =========================================================
   CREATE WITHDRAWAL
========================================================= */

export async function createWithdrawal(
  req: AuthedRequest,
  res: Response
) {

  const idempotencyKey =
    String(
      req.headers[
        'idempotency-key'
      ] || ''
    ).trim();

  try {

    const {
      amount,
      method,
      account,
      accountHolderName
    } = req.body;

    const settings =
      await getSettings();

    const n =
      Number(amount);

    if (
      !Number.isFinite(n) ||
      n <
        Number(
          settings.minimumWithdrawal
        )
    ) {

      return res.status(400).json({
        message:
          `Minimum withdrawal is ${settings.minimumWithdrawal}`
      });
    }

    const pm =
      await PaymentMethod.findOne({
        code:
          String(method).trim(),

        status:
          'ACTIVE'
      });

    if (!pm) {

      return res.status(400).json({
        message:
          'Invalid payment method'
      });
    }

    if (
      n <
      Number(
        pm.minAmount || 0
      )
    ) {

      return res.status(400).json({
        message:
          `Minimum for ${pm.name} is ${pm.minAmount}`
      });
    }

    const destination =
      String(
        account || ''
      ).trim();

    if (
      destination.length < 2
    ) {

      return res.status(400).json({
        message:
          'Withdrawal destination is required'
      });
    }

    const holderName = String(accountHolderName || '').trim();
    if (holderName.length < 2) {
      return res.status(400).json({ message: 'Account holder name is required' });
    }

    const fee =
      Number(
        (
          n *
          Number(
            settings.withdrawalFeePercent
          ) /
          100
        ).toFixed(8)
      );

    const net =
      Number(
        (
          n - fee
        ).toFixed(8)
      );

    if (idempotencyKey) {

      const prior =
        await Withdrawal.findOne({
          userId:
            req.user!.id,

          idempotencyKey
        });

      if (prior) {

        return res.status(200).json({
          message:
            'Withdrawal request already exists',

          withdrawal:
            prior
        });
      }
    }

    const work =
      async (
        session: ClientSession
      ) => {

        await claimWithdrawalSlot(req.user!.id, new Date(), session);

        await reserveWithdrawal(
          req.user!.id,
          n,
          session
        );

        const w = (
          await Withdrawal.create(
            [{
              transactionId:
                txid('WDR'),

              userId:
                req.user!.id,

              amount:
                n,

              fee,

              netAmount:
                net,

              method:
                String(method).trim(),

              account:
                destination,

              accountHolderName:
                holderName,

              status:
                'PENDING',

              idempotencyKey:
                idempotencyKey ||
                undefined,

              reservedAmount:
                n
            }],
            {
              session
            }
          )
        )[0];

        await ledger(
          {
            userId:
              req.user!.id,

            type:
              'WITHDRAWAL',

            amount:
              n,

            fee,

            netAmount:
              net,

            status:
              'PENDING',

            reference:
              w.transactionId ??
              undefined,

            description:
              'Withdrawal request awaiting approval',

            metadata: {
              withdrawalId:
                String(w._id),

              reservedAmount:
                n
            }
          },
          session
        );

        if (fee > 0) {

          await ledger(
            {
              userId:
                req.user!.id,

              type:
                'WITHDRAWAL_FEE',

              amount:
                fee,

              fee:
                0,

              netAmount:
                fee,

              status:
                'PENDING',

              reference:
                `${w.transactionId}-FEE`,

              description:
                'Withdrawal fee',

              metadata: {
                withdrawalId:
                  String(w._id)
              }
            },
            session
          );
        }

        return w;
      };

    const w =
      await withMongoTransaction(
        work,
        async () => {

          if (idempotencyKey) {

            const prior =
              await Withdrawal.findOne({
                userId:
                  req.user!.id,

                idempotencyKey
              });

            if (prior) {
              return prior;
            }
          }

          await claimWithdrawalSlot(req.user!.id);

          await reserveWithdrawal(
            req.user!.id,
            n
          );

          let created: any;

          try {

            created =
              await Withdrawal.create({
                transactionId:
                  txid('WDR'),

                userId:
                  req.user!.id,

                amount:
                  n,

                fee,

                netAmount:
                  net,

                method:
                  String(method).trim(),

                account:
                  destination,

                status:
                  'PENDING',

                idempotencyKey:
                  idempotencyKey ||
                  undefined,

                reservedAmount:
                  n
              });

            await ledger({
              userId:
                req.user!.id,

              type:
                'WITHDRAWAL',

              amount:
                n,

              fee,

              netAmount:
                net,

              status:
                'PENDING',

              reference:
                created.transactionId ??
                undefined,

              description:
                'Withdrawal request awaiting approval',

              metadata: {
                withdrawalId:
                  String(
                    created._id
                  ),

                reservedAmount:
                  n
              }
            });

            if (fee > 0) {

              await ledger({
                userId:
                  req.user!.id,

                type:
                  'WITHDRAWAL_FEE',

                amount:
                  fee,

                netAmount:
                  fee,

                status:
                  'PENDING',

                reference:
                  `${created.transactionId}-FEE`,

                description:
                  'Withdrawal fee',

                metadata: {
                  withdrawalId:
                    String(
                      created._id
                    )
                }
              });
            }

            return created;

          } catch (e: any) {

            await releaseWithdrawal(
              req.user!.id,
              n
            );

            if (created) {

              await Withdrawal.updateOne(
                {
                  _id:
                    created._id,

                  status:
                    'PENDING'
                },
                {
                  $set: {
                    status:
                      'FAILED',

                    processedAt:
                      new Date()
                  }
                }
              );

              await Transaction.updateMany(
                {
                  reference:
                    new RegExp(
                      `^${escapeRegex(
                        String(
                          created.transactionId
                        )
                      )}`
                    ),

                  status:
                    'PENDING'
                },
                {
                  $set: {
                    status:
                      'FAILED'
                  }
                }
              );
            }

            if (
              e?.code === 11000 &&
              idempotencyKey
            ) {

              const prior =
                await Withdrawal.findOne({
                  userId:
                    req.user!.id,

                  idempotencyKey
                });

              if (prior) {
                return prior;
              }
            }

            throw e;
          }
        }
      );

    return res.status(201).json({
      message:
        'Withdrawal request submitted',

      withdrawal:
        w
    });

  } catch (e: any) {

    if (
      e?.code === 11000 &&
      idempotencyKey
    ) {

      const prior =
        await Withdrawal.findOne({
          userId:
            req.user!.id,

          idempotencyKey
        });

      if (prior) {

        return res.status(200).json({
          message:
            'Withdrawal request already exists',

          withdrawal:
            prior
        });
      }
    }

    return res.status(
      e?.code === 11000
        ? 409
        : 400
    ).json({
      message:
        e?.message ||
        'Unable to create withdrawal'
    });
  }
}


/* =========================================================
   TRANSACTIONS
========================================================= */

export async function transactions(
  req: AuthedRequest,
  res: Response
) {

  try {

    const {
      type,
      status,
      q,
      page = '1',
      limit = '25'
    } = req.query;

    const allowedTypes = [
      'DEPOSIT',
      'PACKAGE_PURCHASE',
      'PACKAGE_INCOME',
      'WITHDRAWAL',
      'WITHDRAWAL_FEE',
      'COMMISSION',
      'REWARD',
      'PROMO_REWARD',
      'ADJUSTMENT',
      'REFUND',
      'REVERSAL'
    ];

    const allowedStatuses = [
      'COMPLETED',
      'PENDING',
      'PROCESSING',
      'REJECTED',
      'APPROVED',
      'FAILED'
    ];

    if (
      type &&
      !allowedTypes.includes(
        String(type)
      )
    ) {

      return res.status(400).json({
        message:
          'Invalid transaction type'
      });
    }

    if (
      status &&
      !allowedStatuses.includes(
        String(status)
      )
    ) {

      return res.status(400).json({
        message:
          'Invalid transaction status'
      });
    }

    const filter: any = {
      userId:
        req.user!.id
    };

    if (type) {
      filter.type =
        String(type);
    }

    if (status) {
      filter.status =
        String(status);
    }

    if (q) {

      const safeQ =
        escapeRegex(
          String(q)
        );

      filter.$or = [
        {
          transactionId:
            new RegExp(
              safeQ,
              'i'
            )
        },
        {
          reference:
            new RegExp(
              safeQ,
              'i'
            )
        },
        {
          description:
            new RegExp(
              safeQ,
              'i'
            )
        }
      ];
    }

    const from =
      req.query.from
        ? new Date(
            String(
              req.query.from
            )
          )
        : undefined;

    const to =
      req.query.to
        ? new Date(
            String(
              req.query.to
            )
          )
        : undefined;

    if (
      from &&
      !Number.isFinite(
        from.getTime()
      )
    ) {

      return res.status(400).json({
        message:
          'Invalid from date'
      });
    }

    if (
      to &&
      !Number.isFinite(
        to.getTime()
      )
    ) {

      return res.status(400).json({
        message:
          'Invalid to date'
      });
    }

    if (from || to) {

      filter.createdAt = {
        ...(from
          ? { $gte: from }
          : {}),

        ...(to
          ? { $lte: to }
          : {})
      };
    }

    const pg =
      Math.max(
        1,
        Number(page) || 1
      );

    const lim =
      Math.min(
        100,
        Math.max(
          1,
          Number(limit) || 25
        )
      );

    const [
      items,
      total
    ] = await Promise.all([

      Transaction.find(
        filter
      )
        .sort({
          createdAt: -1
        })
        .skip(
          (pg - 1) * lim
        )
        .limit(lim),

      Transaction.countDocuments(
        filter
      )
    ]);

    return res.json({
      transactions:
        items,

      pagination: {
        page:
          pg,

        limit:
          lim,

        total,

        pages:
          Math.ceil(
            total / lim
          )
      }
    });

  } catch (e: any) {

    return res.status(400).json({
      message:
        e.message ||
        'Unable to load transactions'
    });
  }
}


/* =========================================================
   TEAM / REFERRAL
========================================================= */

export async function team(
  req: AuthedRequest,
  res: Response
) {
  const userId = req.user!.id;

  const settings = await getSettings();

  const user = await User.findById(userId)
    .select('_id userId fullName status referralCode createdAt');

  if (!user) {
    return res.status(404).json({
      message: 'User not found'
    });
  }

  /*
   * Build referral network up to 4 levels.
   *
   * L1 = Direct Team
   * L2-L4 = Indirect Team
   */
  const allUsers = await User.find({})
    .select(
      '_id userId fullName status createdAt referredBy'
    )
    .lean();

  const childrenMap = new Map<
    string,
    typeof allUsers
  >();

  for (const member of allUsers) {
    if (!member.referredBy) continue;

    const parentId = String(member.referredBy);

    const children =
      childrenMap.get(parentId) || [];

    children.push(member);
    childrenMap.set(parentId, children);
  }

  type NetworkMember = {
    _id: string;
    userId: string;
    name: string;
    level: number;
    status: string;
    joinedAt: Date;
    volume: number;
    commission: number;
  };

  const network: NetworkMember[] = [];

  const queue: {
    id: string;
    level: number;
  }[] = [
    {
      id: userId,
      level: 0
    }
  ];

  const visited = new Set<string>([
    userId
  ]);

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.level >= 4) {
      continue;
    }

    const children =
      childrenMap.get(current.id) || [];

    for (const child of children) {
      const childId = String(child._id);

      if (visited.has(childId)) {
        continue;
      }

      visited.add(childId);

      const level =
        current.level + 1;

      network.push({
        _id: childId,
        userId: child.userId,
        name: child.fullName,
        level,
        status: child.status,
        joinedAt: (child as any).createdAt,
        volume: 0,
        commission: 0
      });

      queue.push({
        id: childId,
        level
      });
    }
  }

  /*
   * Current business is calculated from ACTIVE
   * package purchases only.
   */
  const networkIds = [
    userId,
    ...network.map(member => member._id)
  ];

  const purchases =
    await PackagePurchase.find({
      userId: {
        $in: networkIds
      },
      status: 'ACTIVE'
    })
      .select('userId packageAmount')
      .lean();

  const businessMap = new Map<
    string,
    number
  >();

  for (const purchase of purchases) {
    const id = String(purchase.userId);

    const amount =
      Number(purchase.packageAmount || 0);

    businessMap.set(
      id,
      Number(
        (
          (businessMap.get(id) || 0) +
          amount
        ).toFixed(2)
      )
    );
  }

  /*
   * Actual commissions received by each
   * network member.
   */
  const commissions =
    await Commission.find({
      userId: {
        $in: networkIds
      }
    })
      .select('userId amount')
      .lean();

  const commissionMap = new Map<
    string,
    number
  >();

  for (const commission of commissions) {
    const id = String(commission.userId);

    const amount =
      Number(commission.amount || 0);

    commissionMap.set(
      id,
      Number(
        (
          (commissionMap.get(id) || 0) +
          amount
        ).toFixed(2)
      )
    );
  }

  /*
   * Attach real business and commission
   * to each member.
   */
  for (const member of network) {
    member.volume =
      Number(
        businessMap.get(member._id) || 0
      );

    member.commission =
      Number(
        commissionMap.get(member._id) || 0
      );
  }

  const directMembers =
    network.filter(
      member => member.level === 1
    );

  const indirectMembers =
    network.filter(
      member => member.level >= 2
    );

  /*
   * Business calculations
   */
  const selfBusiness =
    Number(
      businessMap.get(userId) || 0
    );

  const directBusiness =
    directMembers.reduce(
      (sum, member) =>
        sum + Number(member.volume || 0),
      0
    );

  const indirectBusiness =
    indirectMembers.reduce(
      (sum, member) =>
        sum + Number(member.volume || 0),
      0
    );

  const totalBusiness =
    selfBusiness +
    directBusiness +
    indirectBusiness;

  const totalCommission =
    network.reduce(
      (sum, member) =>
        sum + Number(member.commission || 0),
      0
    );

  /*
   * Keep existing upline/referral information.
   */
  const chain =
    await getUpline(
      userId,
      4
    );

  return res.json({
    members: network,

    summary: {
      directMembers:
        directMembers.length,

      indirectTeam:
        indirectMembers.length,

      totalTeam:
        network.length,

      activeTeam:
        network.filter(
          member =>
            member.status === 'ACTIVE'
        ).length,

      selfBusiness:
        Number(
          selfBusiness.toFixed(2)
        ),

      directBusiness:
        Number(
          directBusiness.toFixed(2)
        ),

      indirectBusiness:
        Number(
          indirectBusiness.toFixed(2)
        ),

      totalBusiness:
        Number(
          totalBusiness.toFixed(2)
        ),

      commission:
        Number(
          totalCommission.toFixed(2)
        )
    },

    referral: {
      link:
        `${env.CLIENT_URL}/register?ref=${user.referralCode}`,

      code:
        user.referralCode,

      levels:
        settings.commissionRates,

      chain
    }
  });
}
/* =========================================================
   REWARDS
========================================================= */

export async function rewards(
  req: AuthedRequest,
  res: Response
) {

  const tiers =
    await Reward.find({
      status:
        'ACTIVE'
    }).sort({
      threshold:
        1
    });

  const eligible =
    await eligibleRewards(
      req.user!.id
    );

  const claims =
    await (
      await import(
        '../models/index.js'
      )
    ).RewardClaim.find({
      userId:
        req.user!.id
    }).select(
      'rewardId'
    );

  const qualifying =
    await (
      await import(
        '../services/rewardService.js'
      )
    ).qualifyingVolume(
      req.user!.id
    );

  res.json({

    rewards:
      tiers,

    tiers,

    eligible:
      eligible.map(
        x =>
          String(x._id)
      ),

    qualifyingVolume:
      qualifying,

    claimedRewardIds:
      claims.map(
        x =>
          String(
            x.rewardId
          )
      )
  });
}


export async function claimRewardRoute(
  req: AuthedRequest,
  res: Response
) {

  try {

    const tx =
      await claimReward(
        req.user!.id,
        String(
          req.params.id
        )
      );

    res.json({
      message:
        'Reward claimed',

      transaction:
        tx
    });

  } catch (e: any) {

    res.status(400).json({
      message:
        e.message
    });
  }
}


/* =========================================================
   PROMOS
========================================================= */

export async function promoValidate(
  req: AuthedRequest,
  res: Response
) {

  try {

    res.json({
      promo:
        await validatePromo(
          String(
            req.body.code
          ),
          req.user!.id
        )
    });

  } catch (e: any) {

    res.status(400).json({
      message:
        e.message
    });
  }
}


export async function promoApply(
  req: AuthedRequest,
  res: Response
) {

  try {

    res.json({

      message:
        'Promo reward applied',

      transaction:
        await applyPromo(
          String(
            req.body.code
          ),
          req.user!.id,
          String(
            req.headers[
              'idempotency-key'
            ] || ''
          )
        )
    });

  } catch (e: any) {

    res.status(400).json({
      message:
        e.message
    });
  }
}


export async function promos(
  req: AuthedRequest,
  res: Response
) {

  res.json({
    promos:
      await PromoCode.find({
        status:
          'ACTIVE'
      }).sort({
        createdAt:
          -1
      })
  });
}


/* =========================================================
   NOTIFICATIONS
========================================================= */

export async function notifications(
  req: AuthedRequest,
  res: Response
) {

  res.json({
    notifications:
      await Notification.find({
        userId:
          req.user!.id
      }).sort({
        createdAt:
          -1
      })
  });
}


export async function markNotification(
  req: AuthedRequest,
  res: Response
) {

  const result =
    await Notification.updateOne(
      {
        _id:
          req.params.id,

        userId:
          req.user!.id
      },
      {
        $set: {
          read:
            true
        }
      }
    );

  if (
    !result.matchedCount
  ) {

    return res.status(404).json({
      message:
        'Notification not found'
    });
  }

  res.json({
    ok:
      true
  });
}


/* =========================================================
   SUPPORT TICKETS
========================================================= */

export async function tickets(
  req: AuthedRequest,
  res: Response
) {

  const rows =
    await SupportTicket.find({
      userId:
        req.user!.id
    })
      .sort({
        lastMessageAt:
          -1,

        createdAt:
          -1
      })
      .limit(100)
      .lean();

  res.json({
    tickets:
      rows
  });
}


export async function createTicket(
  req: AuthedRequest,
  res: Response
) {

  const subject =
    String(
      req.body.subject
    ).trim();

  const message =
    String(
      req.body.message
    ).trim();

  const t =
    await SupportTicket.create({
      userId:
        req.user!.id,

      subject,

      message,

      status:
        'OPEN',

      lastMessageAt:
        new Date(),

      lastMessagePreview:
        message.slice(0,160),

      unreadForUser:
        0,

      unreadForAdmin:
        1
    });

  try {

    await SupportMessage.create({
      ticketId:
        t._id,

      senderId:
        req.user!.id,

      senderRole:
        'USER',

      message
    });

  } catch(error) {

    await SupportTicket.deleteOne({
      _id:
        t._id
    });

    throw error;
  }

  res.status(201).json(t);
}


export async function supportMessages(
  req: AuthedRequest,
  res: Response
) {

  const ticket =
    await SupportTicket.findOne({
      _id:
        req.params.id,

      userId:
        req.user!.id
    }).lean();

  if(!ticket){

    res.status(404).json({
      message:
        'Support ticket not found'
    });

    return;
  }

  const messages =
    await SupportMessage.find({
      ticketId:
        ticket._id
    })
      .sort({
        createdAt:
          1
      })
      .lean();

  if(messages.length === 0 && ticket.message){

    res.json({
      messages:[
        {
          _id:
            `legacy-${String(ticket._id)}`,

          ticketId:
            String(ticket._id),

          senderId:
            String(ticket.userId),

          senderRole:
            'USER',

          message:
            ticket.message,

          createdAt:
            new Date()
        }
      ]
    });

    return;
  }

  res.json({
    messages
  });
}


export async function supportSendMessage(
  req: AuthedRequest,
  res: Response
) {

  const message =
    String(
      req.body.message
    ).trim();

  const ticket =
    await SupportTicket.findOne({
      _id:
        req.params.id,

      userId:
        req.user!.id
    });

  if(!ticket){

    res.status(404).json({
      message:
        'Support ticket not found'
    });

    return;
  }

  if(ticket.status === 'RESOLVED'){

    res.status(409).json({
      message:
        'This support ticket is resolved. Start a new conversation.'
    });

    return;
  }

  const created =
    await SupportMessage.create({
      ticketId:
        ticket._id,

      senderId:
        req.user!.id,

      senderRole:
        'USER',

      message
    });

  ticket.lastMessageAt =
    new Date();

  ticket.lastMessagePreview =
    message.slice(0,160);

  ticket.unreadForAdmin =
    Number(ticket.unreadForAdmin || 0) + 1;

  ticket.unreadForUser =
    0;

  await ticket.save();

  res.status(201).json({
    message:
      created
  });
}


export async function supportMarkRead(
  req: AuthedRequest,
  res: Response
) {

  const updated =
    await SupportTicket.findOneAndUpdate(
      {
        _id:
          req.params.id,

        userId:
          req.user!.id
      },
      {
        $set:{
          unreadForUser:
            0
        }
      },
      {
        new:
          true
      }
    ).lean();

  if(!updated){

    res.status(404).json({
      message:
        'Support ticket not found'
    });

    return;
  }

  res.json({
    ticket:
      updated
  });
}


/* =========================================================
   SETTINGS
========================================================= */

export async function settings(
  _req: Request,
  res: Response
) {

  res.json(
    await getSettings()
  );
}


/* =========================================================
   ADMIN DASHBOARD
========================================================= */

export async function adminDashboard(
  _req: Request,
  res: Response
) {

  const [
    users,
    activeUsers,
    deposits,
    withdrawals,
    activePackages,
    pendingDeposits,
    pendingWithdrawals,
    packagePurchases,
    incomeDistributed,
    commissionDistributed,
    rewardsDistributed
  ] = await Promise.all([

    User.countDocuments(),

    User.countDocuments({
      status:
        'ACTIVE'
    }),

    Transaction.aggregate([
      {
        $match: {
          type:
            'DEPOSIT',

          status:
            'COMPLETED'
        }
      },
      {
        $group: {
          _id:
            null,

          total:
            {
              $sum:
                '$amount'
            },

          count:
            {
              $sum:
                1
            }
        }
      }
    ]),

    Transaction.aggregate([
      {
        $match: {
          type:
            'WITHDRAWAL',

          status:
            'COMPLETED'
        }
      },
      {
        $group: {
          _id:
            null,

          total:
            {
              $sum:
                '$amount'
            },

          count:
            {
              $sum:
                1
            }
        }
      }
    ]),

    PackagePurchase.countDocuments({
      status:
        'ACTIVE'
    }),

    Deposit.countDocuments({
      status:
        'PENDING'
    }),

    Withdrawal.countDocuments({
      status: {
        $in: [
          'PENDING',
          'APPROVED',
          'PROCESSING'
        ]
      }
    }),

    PackagePurchase.countDocuments(),

    Transaction.aggregate([
      {
        $match: {
          type:
            'PACKAGE_INCOME',

          status:
            'COMPLETED'
        }
      },
      {
        $group: {
          _id:
            null,

          total:
            {
              $sum:
                '$amount'
            }
        }
      }
    ]),

    Transaction.aggregate([
      {
        $match: {
          type:
            'COMMISSION',

          status:
            'COMPLETED'
        }
      },
      {
        $group: {
          _id:
            null,

          total:
            {
              $sum:
                '$amount'
            }
        }
      }
    ]),

    Transaction.aggregate([
      {
        $match: {
          type: {
            $in: [
              'REWARD',
              'PROMO_REWARD'
            ]
          },

          status:
            'COMPLETED'
        }
      },
      {
        $group: {
          _id:
            null,

          total:
            {
              $sum:
                '$amount'
            }
        }
      }
    ])
  ]);

  res.json({

    users,

    activeUsers,

    deposits:
      deposits[0]?.total ||
      0,

    pendingDeposits,

    completedDeposits:
      deposits[0]?.count ||
      0,

    withdrawals:
      withdrawals[0]?.total ||
      0,

    pendingWithdrawals,

    packagePurchases,

    activePackages,

    incomeDistributed:
      incomeDistributed[0]?.total ||
      0,

    commissionDistributed:
      commissionDistributed[0]?.total ||
      0,

    rewardsDistributed:
      rewardsDistributed[0]?.total ||
      0
  });
}


/* =========================================================
   ADMIN USERS / PACKAGES / DEPOSITS
========================================================= */

export async function adminUsers(
  _req: Request,
  res: Response
) {

  res.json({
    users:
      await User.find()
        .select(
          '-passwordHash'
        )
        .sort({
          createdAt:
            -1
        })
        .lean()
  });
}


export async function adminPackages(
  _req: Request,
  res: Response
) {

  res.json({
    packages:
      await Package.find()
        .sort({
          sortOrder:
            1,

          createdAt:
            1
        })
        .lean()
  });
}


export async function adminDeposits(
  _req: Request,
  res: Response
) {

  const rows =
    await Deposit.find()
      .populate(
        'userId',
        'fullName email userId'
      )
      .populate(
        'packageId',
        'name amount'
      )
      .sort({
        createdAt:
          -1
      });

  res.json({

    deposits:
      rows.map(
        d => ({
          ...d.toObject(),

          packageName:
            (d.packageId as any)?.name ||
            'Package',

          packageId:
            String(
              (d.packageId as any)?._id ||
              d.packageId
            )
        })
      )
  });
}


/* =========================================================
   ADMIN DEPOSIT REJECT
========================================================= */

export async function adminDepositReject(
  req: AuthedRequest,
  res: Response
) {

  try {

    const work =
      async (
        session: ClientSession
      ) => {

        const d =
          await Deposit.findOne({
            _id:
              req.params.id,

            status: {
              $in: [
                'PENDING',
                'PROCESSING'
              ]
            }
          }).session(session);

        if (!d) {

          throw Object.assign(
            new Error(
              'Deposit is no longer reviewable'
            ),
            {
              statusCode:
                409
            }
          );
        }

        const old =
          d.status;

        d.status =
          'REJECTED';

        d.verifiedBy =
          req.user!.id as any;

        d.verifiedAt =
          new Date();

        await d.save({
          session
        });

        await Transaction.updateOne(
          {
            reference:
              d.transactionId,

            type:
              'DEPOSIT',

            status:
              'PENDING'
          },
          {
            $set: {
              status:
                'REJECTED'
            }
          },
          {
            session
          }
        );

        await AuditLog.create(
          [{
            adminId:
              req.user!.id,

            action:
              'REJECT',

            target:
              'Deposit',

            targetId:
              String(
                d._id
              ),

            oldValue: {
              status:
                old
            },

            newValue: {
              status:
                'REJECTED'
            },

            ip:
              req.ip
          }],
          {
            session
          }
        );

        return d.toObject();
      };

    const d =
      await withMongoTransaction(
        work,
        async () => {

          const current =
            await Deposit.findOne({
              _id:
                req.params.id,

              status: {
                $in: [
                  'PENDING',
                  'PROCESSING'
                ]
              }
            });

          if (!current) {

            throw Object.assign(
              new Error(
                'Deposit is no longer reviewable'
              ),
              {
                statusCode:
                  409
              }
            );
          }

          current.status =
            'REJECTED';

          current.verifiedBy =
            req.user!.id as any;

          current.verifiedAt =
            new Date();

          await current.save();

          await Transaction.updateOne(
            {
              reference:
                current.transactionId,

              type:
                'DEPOSIT',

              status:
                'PENDING'
            },
            {
              $set: {
                status:
                  'REJECTED'
              }
            }
          );

          await audit(
            req,
            'REJECT',
            'Deposit',
            String(
              current._id
            ),
            {
              status:
                'PENDING'
            },
            {
              status:
                'REJECTED'
            }
          );

          return current.toObject();
        }
      );

    return res.json({
      message:
        'Deposit rejected',

      deposit:
        d
    });

  } catch (e: any) {

    return res.status(
      e?.statusCode ||
      500
    ).json({
      message:
        e?.message ||
        'Deposit rejection failed'
    });
  }
}


/* =========================================================
   ADMIN WITHDRAWALS / TRANSACTIONS
========================================================= */

export async function adminWithdrawals(
  _req: Request,
  res: Response
) {

  const withdrawals =
    await Withdrawal.find()
      .populate(
        'userId',
        'fullName email userId'
      )
      .sort({
        createdAt:
          -1
      })
      .lean();

  return res.json({
    withdrawals
  });
}


export async function adminTransactions(
  _req: Request,
  res: Response
) {

  const transactions =
    await Transaction.find()
      .sort({
        createdAt:
          -1
      })
      .limit(500)
      .lean();

  return res.json({
    transactions
  });
}


export async function adminPaymentMethods(
  _req: Request,
  res: Response
) {

  const methods =
    await PaymentMethod.find()
      .sort({
        displayOrder:
          1
      })
      .lean();

  return res.json({
    methods
  });
}


export async function adminPromos(
  _req: Request,
  res: Response
) {

  const promos =
    await PromoCode.find()
      .sort({
        createdAt:
          -1
      })
      .lean();

  return res.json({
    promos
  });
}


export async function adminRewards(
  _req: Request,
  res: Response
) {

  res.json({
    rewards:
      await Reward.find()
        .sort({
          sortOrder:
            1
        })
  });
}


export async function adminSettings(
  _req: Request,
  res: Response
) {

  res.json(
    await getSettings()
  );
}


export async function adminAuditLogs(
  _req: Request,
  res: Response
) {

  res.json({
    logs:
      await AuditLog.find()
        .sort({
          createdAt:
            -1
        })
        .limit(500)
  });
}


export async function adminNotifications(
  _req: Request,
  res: Response
) {

  res.json({
    notifications:
      await Notification.find()
        .sort({
          createdAt:
            -1
        })
        .limit(500)
  });
}


export async function adminTickets(
  _req: Request,
  res: Response
) {

  const rows =
    await SupportTicket.find()
      .sort({
        unreadForAdmin:
          -1,

        lastMessageAt:
          -1,

        createdAt:
          -1
      })
      .limit(500)
      .populate({
        path:
          'userId',

        select:
          'fullName email userId'
      })
      .lean();

  res.json({
    tickets:
      rows.map(
        (ticket:any)=>({

          ...ticket,

          user:
            ticket.userId &&
            typeof ticket.userId === 'object'
              ? {
                  _id:
                    String(ticket.userId._id),

                  fullName:
                    ticket.userId.fullName,

                  email:
                    ticket.userId.email,

                  userId:
                    ticket.userId.userId
                }
              : undefined,

          userId:
            ticket.userId &&
            typeof ticket.userId === 'object'
              ? String(ticket.userId._id)
              : String(ticket.userId)
        })
      )
  });
}


export async function adminSupportMessages(
  _req: Request,
  res: Response
) {

  const ticket =
    await SupportTicket.findById(
      _req.params.id
    ).lean();

  if(!ticket){

    res.status(404).json({
      message:
        'Support ticket not found'
    });

    return;
  }

  const messages =
    await SupportMessage.find({
      ticketId:
        ticket._id
    })
      .sort({
        createdAt:
          1
      })
      .lean();

  if(messages.length === 0 && ticket.message){

    res.json({
      messages:[
        {
          _id:
            `legacy-${String(ticket._id)}`,

          ticketId:
            String(ticket._id),

          senderId:
            String(ticket.userId),

          senderRole:
            'USER',

          message:
            ticket.message,

          createdAt:
            new Date()
        }
      ]
    });

    return;
  }

  res.json({
    messages
  });
}


export async function adminSupportSendMessage(
  req: AuthedRequest,
  res: Response
) {

  const message =
    String(
      req.body.message
    ).trim();

  const ticket =
    await SupportTicket.findById(
      req.params.id
    );

  if(!ticket){

    res.status(404).json({
      message:
        'Support ticket not found'
    });

    return;
  }

  if(ticket.status === 'RESOLVED'){

    res.status(409).json({
      message:
        'This support ticket is resolved. Reopen it before replying.'
    });

    return;
  }

  const created =
    await SupportMessage.create({
      ticketId:
        ticket._id,

      senderId:
        req.user!.id,

      senderRole:
        'ADMIN',

      message
    });

  ticket.status =
    ticket.status === 'OPEN'
      ? 'IN_PROGRESS'
      : ticket.status;

  ticket.lastMessageAt =
    new Date();

  ticket.lastMessagePreview =
    message.slice(0,160);

  ticket.unreadForUser =
    Number(ticket.unreadForUser || 0) + 1;

  ticket.unreadForAdmin =
    0;

  await ticket.save();

  res.status(201).json({
    message:
      created,

    ticket
  });
}


export async function adminSupportMarkRead(
  req: AuthedRequest,
  res: Response
) {

  const updated =
    await SupportTicket.findByIdAndUpdate(
      req.params.id,
      {
        $set:{
          unreadForAdmin:
            0
        }
      },
      {
        new:
          true
      }
    ).lean();

  if(!updated){

    res.status(404).json({
      message:
        'Support ticket not found'
    });

    return;
  }

  res.json({
    ticket:
      updated
  });
}


export async function adminSupportStatus(
  req: AuthedRequest,
  res: Response
) {

  const updated =
    await SupportTicket.findByIdAndUpdate(
      req.params.id,
      {
        $set:{
          status:
            req.body.status
        }
      },
      {
        new:
          true
      }
    ).lean();

  if(!updated){

    res.status(404).json({
      message:
        'Support ticket not found'
    });

    return;
  }

  res.json({
    ticket:
      updated
  });
}


/* =========================================================
   PACKAGE CRUD
========================================================= */

function normalizePackageInput(
  body: any,
  existing?: any
) {

  const name =
    String(
      body.name ??
      existing?.name ??
      ''
    ).trim();

  const amount =
    Number(
      body.amount ??
      existing?.amount
    );

  const cycleDays =
    Number(
      body.cycleDays ??
      existing?.cycleDays
    );

  const daily =
    Number(
      body.dailyIncome ??
      body.incomeConfiguration?.daily ??
      existing?.incomeConfiguration?.daily
    );

  const sortOrder =
    Number(
      body.sortOrder ??
      existing?.sortOrder ??
      0
    );

  const description =
    String(
      body.description ??
      existing?.description ??
      ''
    ).trim();

  const image =
    body.image ??
    existing?.image;

  const status =
    body.status ??
    existing?.status ??
    'ACTIVE';

  if (
    !name ||
    name.length > 150
  ) {

    throw new Error(
      'Package name is required and must be <= 150 characters'
    );
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    throw new Error(
      'Package price must be greater than 0'
    );
  }

  if (
    !Number.isFinite(daily) ||
    daily < 0
  ) {

    throw new Error(
      'Package daily income cannot be negative'
    );
  }

  if (
    !Number.isInteger(
      cycleDays
    ) ||
    cycleDays <= 0
  ) {

    throw new Error(
      'Package duration/cycle must be a positive integer'
    );
  }

  if (
    !Number.isFinite(sortOrder) ||
    sortOrder < 0
  ) {

    throw new Error(
      'Sort order must be a non-negative number'
    );
  }

  if (
    image !== undefined &&
    image !== null &&
    String(image).length > 2000
  ) {

    throw new Error(
      'Package image is invalid'
    );
  }

  if (
    description.length > 5000
  ) {

    throw new Error(
      'Package description is too long'
    );
  }

  if (
    ![
      'ACTIVE',
      'DISABLED',
      'ARCHIVED'
    ].includes(status)
  ) {

    throw new Error(
      'Invalid package status'
    );
  }

  return {

    name,

    amount,

    cycleDays,

    incomeConfiguration: {

      daily,

      total:
        Number(
          body.totalIncome ??
          body.incomeConfiguration?.total ??
          existing?.incomeConfiguration?.total ??
          0
        )
    },

    description,

    image,

    status,

    sortOrder
  };
}


export async function createPackage(
  req: AuthedRequest,
  res: Response
) {

  try {

    const data =
      normalizePackageInput(
        req.body
      );

    const p =
      await Package.create(
        data
      );

    await audit(
      req,
      'CREATE',
      'Package',
      String(
        p._id
      ),
      undefined,
      p.toObject()
    );

    return res.status(201).json({
      package:
        p
    });

  } catch (e: any) {

    return res.status(400).json({
      message:
        e.message ||
        'Invalid package data'
    });
  }
}


export async function updatePackage(
  req: AuthedRequest,
  res: Response
) {

  const id =
    String(
      req.params.id
    );

  const old =
    await Package.findById(
      id
    );

  if (!old) {

    return res.status(404).json({
      message:
        'Package not found'
    });
  }

  try {

    const data =
      normalizePackageInput(
        req.body,
        old
      );

    const p =
      await Package.findByIdAndUpdate(
        id,
        data,
        {
          new:
            true,

          runValidators:
            true
        }
      );

    await audit(
      req,
      'UPDATE',
      'Package',
      id,
      old.toObject(),
      p?.toObject()
    );

    return res.json({
      package:
        p
    });

  } catch (e: any) {

    return res.status(400).json({
      message:
        e.message ||
        'Invalid package data'
    });
  }
}


export async function archivePackage(
  req: AuthedRequest,
  res: Response
) {

  const id =
    String(
      req.params.id
    );

  const old =
    await Package.findById(
      id
    );

  if (!old) {

    return res.status(404).json({
      message:
        'Package not found'
    });
  }

  const p =
    await Package.findByIdAndUpdate(
      id,
      {
        status:
          'ARCHIVED'
      },
      {
        new:
          true
      }
    );

  await audit(
    req,
    'ARCHIVE',
    'Package',
    id,
    old.toObject(),
    p?.toObject()
  );

  res.json({
    package:
      p
  });
}


export async function adminDepositAction(
  req: AuthedRequest,
  res: Response
) {

  return verifyDeposit(
    req,
    res
  );
}


/* =========================================================
   ADMIN WITHDRAWAL APPROVE
========================================================= */

export async function adminWithdrawalApprove(
  req: AuthedRequest,
  res: Response
) {

  try {

    const work =
      async (
        session: ClientSession
      ) => {

        const w =
          await Withdrawal.findOne({
            _id:
              req.params.id,

            status:
              'PENDING'
          }).session(session);

        if (!w) {

          throw Object.assign(
            new Error(
              'Only a pending withdrawal can be approved'
            ),
            {
              statusCode:
                409
            }
          );
        }

        w.status =
          'APPROVED';

        w.approvedBy =
          req.user!.id as any;

        w.processedAt =
          new Date();

        if (
          req.body?.reference
        ) {

          w.reference =
            String(
              req.body.reference
            );
        }

        await w.save({
          session
        });

        await Transaction.updateMany(
          {
            reference: new RegExp(
              `^${escapeRegex(String(w.transactionId))}`
            ),
            type: {
              $in: ['WITHDRAWAL', 'WITHDRAWAL_FEE']
            }
          },
          {
            $set: {
              status: 'APPROVED'
            }
          },
          {
            session
          }
        );

        await AuditLog.create(
          [{
            adminId:
              req.user!.id,

            action:
              'APPROVE',

            target:
              'Withdrawal',

            targetId:
              String(
                w._id
              ),

            oldValue: {
              status:
                'PENDING'
            },

            newValue: {
              status:
                'APPROVED'
            },

            ip:
              req.ip
          }],
          {
            session
          }
        );

        return w.toObject();
      };

    const w =
      await withMongoTransaction(
        work,
        async () => {

          const updated =
            await Withdrawal.findOneAndUpdate(
              {
                _id:
                  req.params.id,

                status:
                  'PENDING'
              },
              {
                $set: {
                  status:
                    'APPROVED',

                  approvedBy:
                    req.user!.id,

                  processedAt:
                    new Date(),

                  reference:
                    req.body?.reference ||
                    undefined
                }
              },
              {
                new:
                  true
              }
            );

          if (!updated) {

            throw Object.assign(
              new Error(
                'Only a pending withdrawal can be approved'
              ),
              {
                statusCode:
                  409
              }
            );
          }

          await audit(
            req,
            'APPROVE',
            'Withdrawal',
            String(
              updated._id
            ),
            {
              status:
                'PENDING'
            },
            {
              status:
                'APPROVED'
            }
          );

          return updated.toObject();
        }
      );

    void sendTelegramNotification(String(w.userId), 'Your withdrawal request has been approved.');

    return res.json({
      message:
        'Withdrawal approved',

      withdrawal:
        w
    });

  } catch (e: any) {

    return res.status(
      e?.statusCode ||
      500
    ).json({
      message:
        e?.message ||
        'Withdrawal approval failed'
    });
  }
}


/* =========================================================
   ADMIN WITHDRAWAL PROCESSING
========================================================= */

export async function adminWithdrawalProcessing(
  req: AuthedRequest,
  res: Response
) {

  try {

    if (!isWithdrawalProcessingWindow()) {
      return res.status(409).json({ message: 'Withdrawal processing is currently unavailable' });
    }

    const work =
      async (
        session: ClientSession
      ) => {

        const w =
          await Withdrawal.findOne({
            _id:
              req.params.id,

            status:
              'APPROVED'
          }).session(session);

        if (!w) {

          throw Object.assign(
            new Error(
              'Only an approved withdrawal can move to processing'
            ),
            {
              statusCode:
                409
            }
          );
        }

        w.status =
          'PROCESSING';

        await w.save({
          session
        });

        await Transaction.updateMany(
          {
            reference: new RegExp(
              `^${escapeRegex(String(w.transactionId))}`
            ),
            type: {
              $in: ['WITHDRAWAL', 'WITHDRAWAL_FEE']
            }
          },
          {
            $set: {
              status: 'PROCESSING'
            }
          },
          {
            session
          }
        );

        await AuditLog.create(
          [{
            adminId:
              req.user!.id,

            action:
              'PROCESS',

            target:
              'Withdrawal',

            targetId:
              String(
                w._id
              ),

            oldValue: {
              status:
                'APPROVED'
            },

            newValue: {
              status:
                'PROCESSING'
            },

            ip:
              req.ip
          }],
          {
            session
          }
        );

        return w.toObject();
      };

    const w =
      await withMongoTransaction(
        work,
        async () => {

          const updated =
            await Withdrawal.findOneAndUpdate(
              {
                _id:
                  req.params.id,

                status:
                  'APPROVED'
              },
              {
                $set: {
                  status:
                    'PROCESSING'
                }
              },
              {
                new:
                  true
              }
            );

          if (!updated) {

            throw Object.assign(
              new Error(
                'Only an approved withdrawal can move to processing'
              ),
              {
                statusCode:
                  409
              }
            );
          }

          await audit(
            req,
            'PROCESS',
            'Withdrawal',
            String(
              updated._id
            ),
            {
              status:
                'APPROVED'
            },
            {
              status:
                'PROCESSING'
            }
          );

          return updated.toObject();
        }
      );

    void sendTelegramNotification(String(w.userId), 'Your withdrawal is now being processed.');

    return res.json({
      message:
        'Withdrawal moved to processing',

      withdrawal:
        w
    });

  } catch (e: any) {

    return res.status(
      e?.statusCode ||
      500
    ).json({
      message:
        e?.message ||
        'Unable to process withdrawal'
    });
  }
}


/* =========================================================
   ADMIN WITHDRAWAL COMPLETE
========================================================= */

export async function adminWithdrawalComplete(
  req: AuthedRequest,
  res: Response
) {

  try {

    const work =
      async (
        session: ClientSession
      ) => {

        const w =
          await Withdrawal.findOne({
            _id:
              req.params.id,

            status:
              'PROCESSING'
          }).session(session);

        if (!w) {

          throw Object.assign(
            new Error(
              'Only a processing withdrawal can be completed'
            ),
            {
              statusCode:
                409
            }
          );
        }

        await finalizeWithdrawal(
          String(
            w.userId
          ),

          Number(
            w.reservedAmount ||
            w.amount
          ),

          session
        );

        w.status =
          'COMPLETED';

        w.processedAt =
          new Date();

        if (
          req.body?.reference
        ) {

          w.reference =
            String(
              req.body.reference
            );
        }

        await w.save({
          session
        });

        /*
         * IMPORTANT:
         * Both WITHDRAWAL and WITHDRAWAL_FEE
         * use the same transaction prefix.
         * Fee transaction actually ends with -FEE,
         * so exact reference matching is incorrect.
         */
        await Transaction.updateMany(
          {
            reference:
              new RegExp(
                `^${escapeRegex(
                  String(
                    w.transactionId
                  )
                )}`
              ),

            type: {
              $in: [
                'WITHDRAWAL',
                'WITHDRAWAL_FEE'
              ]
            },

            status: {
              $in: [
                'PENDING',
                'APPROVED',
                'PROCESSING'
              ]
            }
          },
          {
            $set: {
              status:
                'COMPLETED'
            }
          },
          {
            session
          }
        );

        await AuditLog.create(
          [{
            adminId:
              req.user!.id,

            action:
              'COMPLETE',

            target:
              'Withdrawal',

            targetId:
              String(
                w._id
              ),

            oldValue: {
              status:
                'PROCESSING'
            },

            newValue: {
              status:
                'COMPLETED'
            },

            ip:
              req.ip
          }],
          {
            session
          }
        );

        return w.toObject();
      };

    const w =
      await withMongoTransaction(
        work,
        async () => {

          const current =
            await Withdrawal.findOne({
              _id:
                req.params.id,

              status:
                'PROCESSING'
            });

          if (!current) {

            throw Object.assign(
              new Error(
                'Only a processing withdrawal can be completed'
              ),
              {
                statusCode:
                  409
              }
            );
          }

          await finalizeWithdrawal(
            String(
              current.userId
            ),

            Number(
              current.reservedAmount ||
              current.amount
            )
          );

          const completed =
            await Withdrawal.findOneAndUpdate(
              {
                _id:
                  current._id,

                status:
                  'PROCESSING'
              },
              {
                $set: {
                  status:
                    'COMPLETED',

                  processedAt:
                    new Date(),

                  reference:
                    req.body?.reference ||
                    current.reference
                }
              },
              {
                new:
                  true
              }
            );

          if (!completed) {

            throw Object.assign(
              new Error(
                'Withdrawal state changed during completion'
              ),
              {
                statusCode:
                  409
              }
            );
          }

          /*
           * FIX:
           * Match both main withdrawal and fee
           * transaction references.
           */
          await Transaction.updateMany(
            {
              reference:
                new RegExp(
                  `^${escapeRegex(
                    String(
                      current.transactionId
                    )
                  )}`
                ),

              type: {
                $in: [
                  'WITHDRAWAL',
                  'WITHDRAWAL_FEE'
                ]
              },

              status: {
                $in: [
                  'PENDING',
                  'APPROVED',
                  'PROCESSING'
                ]
              }
            },
            {
              $set: {
                status:
                  'COMPLETED'
              }
            }
          );

          await audit(
            req,
            'COMPLETE',
            'Withdrawal',
            String(
              current._id
            ),
            {
              status:
                'PROCESSING'
            },
            {
              status:
                'COMPLETED'
            }
          );

          return completed.toObject();
        }
      );

    void sendTelegramNotification(String(w.userId), 'Your withdrawal has been completed.');

    return res.json({
      message:
        'Withdrawal completed',

      withdrawal:
        w
    });

  } catch (e: any) {

    return res.status(
      e?.statusCode ||
      500
    ).json({
      message:
        e?.message ||
        'Withdrawal completion failed'
    });
  }
}


/* =========================================================
   ADMIN WITHDRAWAL REJECT
========================================================= */

export async function adminWithdrawalReject(
  req: AuthedRequest,
  res: Response
) {

  try {

    const work =
      async (
        session: ClientSession
      ) => {

        const w =
          await Withdrawal.findOne({
            _id:
              req.params.id,

            status:
              'PENDING'
          }).session(session);

        if (!w) {

          throw Object.assign(
            new Error(
              'Only a pending withdrawal can be rejected'
            ),
            {
              statusCode:
                409
            }
          );
        }

        const released =
          await releaseWithdrawal(
            String(
              w.userId
            ),

            Number(
              w.reservedAmount ||
              w.amount
            ),

            session
          );

        if (!released) {

          throw Object.assign(
            new Error(
              'Withdrawal reservation is already released'
            ),
            {
              statusCode:
                409
            }
          );
        }

        w.status =
          'REJECTED';

        w.rejectedBy =
          req.user!.id as any;

        w.processedAt =
          new Date();

        await w.save({
          session
        });

        await Transaction.updateMany(
          {
            reference:
              new RegExp(
                `^${escapeRegex(
                  String(
                    w.transactionId
                  )
                )}`
              )
          },
          {
            $set: {
              status:
                'REJECTED'
            }
          },
          {
            session
          }
        );

        await AuditLog.create(
          [{
            adminId:
              req.user!.id,

            action:
              'REJECT',

            target:
              'Withdrawal',

            targetId:
              String(
                w._id
              ),

            oldValue: {
              status:
                'PENDING'
            },

            newValue: {
              status:
                'REJECTED'
            },

            ip:
              req.ip
          }],
          {
            session
          }
        );

        return w.toObject();
      };

    const w =
      await withMongoTransaction(
        work,
        async () => {

          const current =
            await Withdrawal.findOneAndUpdate(
              {
                _id:
                  req.params.id,

                status:
                  'PENDING'
              },
              {
                $set: {
                  status:
                    'REJECTED',

                  rejectedBy:
                    req.user!.id,

                  processedAt:
                    new Date()
                }
              },
              {
                new:
                  true
              }
            );

          if (!current) {

            throw Object.assign(
              new Error(
                'Only a pending withdrawal can be rejected'
              ),
              {
                statusCode:
                  409
              }
            );
          }

          const released =
            await releaseWithdrawal(
              String(
                current.userId
              ),

              Number(
                current.reservedAmount ||
                current.amount
              )
            );

          if (!released) {

            throw Object.assign(
              new Error(
                'Withdrawal reservation is already released'
              ),
              {
                statusCode:
                  409
              }
            );
          }

          await Transaction.updateMany(
            {
              reference:
                new RegExp(
                  `^${escapeRegex(
                    String(
                      current.transactionId
                    )
                  )}`
                )
            },
            {
              $set: {
                status:
                  'REJECTED'
              }
            }
          );

          await audit(
            req,
            'REJECT',
            'Withdrawal',
            String(
              current._id
            ),
            {
              status:
                'PENDING'
            },
            {
              status:
                'REJECTED'
            }
          );

          return current.toObject();
        }
      );

    void sendTelegramNotification(String(w.userId), 'Your withdrawal request was rejected and reserved funds were released.');

    return res.json({
      message:
        'Withdrawal rejected; reserved funds released',

      withdrawal:
        w
    });

  } catch (e: any) {

    return res.status(
      e?.statusCode ||
      500
    ).json({
      message:
        e?.message ||
        'Withdrawal rejection failed'
    });
  }
}


/* =========================================================
   PAYMENT METHOD CRUD
========================================================= */

export async function crudPayment(
  req: AuthedRequest,
  res: Response
) {

  try {

    const b =
      req.body || {};

    const data = {

      code:
        String(
          b.code || ''
        )
          .trim()
          .toLowerCase(),

      name:
        String(
          b.name || ''
        ).trim(),

      status:
        b.status ||
        'ACTIVE',

      instructions:
        String(
          b.instructions || ''
        ),

      accountDetails:
        b.accountDetails,

      minAmount:
        Number(
          b.minAmount ?? 0
        ),

      displayOrder:
        Number(
          b.displayOrder ?? 0
        ),

      verificationMode:
        b.verificationMode ||
        'MANUAL'
    };

    if (
      !data.code ||
      !data.name ||
      data.minAmount < 0 ||
      !Number.isFinite(
        data.minAmount
      ) ||
      !Number.isFinite(
        data.displayOrder
      ) ||
      data.displayOrder < 0 ||
      ![
        'ACTIVE',
        'DISABLED'
      ].includes(
        data.status
      ) ||
      data.verificationMode !==
        'MANUAL'
    ) {

      return res.status(400).json({
        message:
          'Invalid payment method data: only MANUAL verification is configured until a real provider adapter is connected.'
      });
    }

    const old =
      req.params.id
        ? await PaymentMethod.findById(
            req.params.id
          )
        : undefined;

    if (
      req.params.id &&
      !old
    ) {

      return res.status(404).json({
        message:
          'Payment method not found'
      });
    }

    const pm =
      req.params.id
        ? await PaymentMethod.findByIdAndUpdate(
            req.params.id,
            data,
            {
              new:
                true,

              runValidators:
                true
            }
          )
        : await PaymentMethod.create(
            data
          );

    await audit(
      req,
      req.params.id
        ? 'UPDATE'
        : 'CREATE',
      'PaymentMethod',
      String(
        pm?._id
      ),
      old?.toObject(),
      pm?.toObject()
    );

    res.status(
      req.params.id
        ? 200
        : 201
    ).json({
      method:
        pm
    });

  } catch (e: any) {

    res.status(400).json({
      message:
        e.message ||
        'Invalid payment method data'
    });
  }
}


/* =========================================================
   PROMO CRUD
========================================================= */

export async function crudPromo(
  req: AuthedRequest,
  res: Response
) {

  try {

    const b =
      req.body || {};

    const code =
      String(
        b.code || ''
      )
        .trim()
        .toUpperCase();

    const rewardValue =
      Number(
        b.rewardValue
      );

    const usageLimit =
      b.usageLimit == null ||
      b.usageLimit === ''
        ? undefined
        : Number(
            b.usageLimit
          );

    const perUserLimit =
      b.perUserLimit == null ||
      b.perUserLimit === ''
        ? undefined
        : Number(
            b.perUserLimit
          );

    const minRequirement =
      b.minRequirement == null ||
      b.minRequirement === ''
        ? 0
        : Number(
            b.minRequirement
          );

    const status =
      b.status ||
      'ACTIVE';

    const rewardType =
      String(
        b.rewardType ||
        'FIXED'
      );

    if (
      !code ||
      code.length > 80 ||
      !Number.isFinite(
        rewardValue
      ) ||
      rewardValue <= 0 ||
      rewardType !== 'FIXED' ||
      !Number.isFinite(
        minRequirement
      ) ||
      minRequirement < 0 ||
      (
        usageLimit !== undefined &&
        (
          !Number.isInteger(
            usageLimit
          ) ||
          usageLimit <= 0
        )
      ) ||
      (
        perUserLimit !== undefined &&
        (
          !Number.isInteger(
            perUserLimit
          ) ||
          perUserLimit <= 0
        )
      ) ||
      ![
        'ACTIVE',
        'DISABLED'
      ].includes(
        status
      )
    ) {

      return res.status(400).json({
        message:
          'Invalid promo configuration'
      });
    }

    let expiresAt:
      | Date
      | undefined;

    if (b.expiresAt) {

      expiresAt =
        new Date(
          String(
            b.expiresAt
          )
        );

      if (
        !Number.isFinite(
          expiresAt.getTime()
        )
      ) {

        return res.status(400).json({
          message:
            'Invalid promo expiry date'
        });
      }
    }

    const data = {

      code,

      rewardType,

      rewardValue,

      usageLimit,

      perUserLimit,

      minRequirement,

      expiresAt,

      status
    };

    const old =
      req.params.id
        ? await PromoCode.findById(
            req.params.id
          )
        : undefined;

    if (
      req.params.id &&
      !old
    ) {

      return res.status(404).json({
        message:
          'Promo code not found'
      });
    }

    const promo =
      req.params.id
        ? await PromoCode.findByIdAndUpdate(
            req.params.id,
            data,
            {
              new:
                true,

              runValidators:
                true
            }
          )
        : await PromoCode.create(
            data
          );

    await audit(
      req,
      req.params.id
        ? 'UPDATE'
        : 'CREATE',
      'PromoCode',
      String(
        promo?._id
      ),
      old?.toObject(),
      promo?.toObject()
    );

    return res.status(
      req.params.id
        ? 200
        : 201
    ).json({
      promo
    });

  } catch (e: any) {

    return res.status(
      e?.code === 11000
        ? 409
        : 400
    ).json({
      message:
        e.message ||
        'Invalid promo configuration'
    });
  }
}


/* =========================================================
   REWARD CRUD
========================================================= */

export async function crudReward(
  req: AuthedRequest,
  res: Response
) {

  try {

    const threshold =
      Number(
        req.body?.threshold
      );

    const reward =
      Number(
        req.body?.reward
      );

    const sortOrder =
      Number(
        req.body?.sortOrder ??
        0
      );

    const status =
      req.body?.status ||
      'ACTIVE';

    if (
      !Number.isFinite(
        threshold
      ) ||
      threshold <= 0 ||
      !Number.isFinite(
        reward
      ) ||
      reward <= 0 ||
      !Number.isFinite(
        sortOrder
      ) ||
      sortOrder < 0 ||
      ![
        'ACTIVE',
        'DISABLED'
      ].includes(
        status
      )
    ) {

      return res.status(400).json({
        message:
          'Invalid reward tier'
      });
    }

    const data = {
      threshold,
      reward,
      sortOrder,
      status
    };

    const old =
      req.params.id
        ? await Reward.findById(
            req.params.id
          )
        : undefined;

    if (
      req.params.id &&
      !old
    ) {

      return res.status(404).json({
        message:
          'Reward not found'
      });
    }

    const r =
      req.params.id
        ? await Reward.findByIdAndUpdate(
            req.params.id,
            data,
            {
              new:
                true,

              runValidators:
                true
            }
          )
        : await Reward.create(
            data
          );

    await audit(
      req,
      req.params.id
        ? 'UPDATE'
        : 'CREATE',
      'Reward',
      String(
        r?._id
      ),
      old?.toObject(),
      r?.toObject()
    );

    res.status(
      req.params.id
        ? 200
        : 201
    ).json({
      reward:
        r
    });

  } catch (e: any) {

    res.status(400).json({
      message:
        e.message ||
        'Invalid reward tier'
    });
  }
}


/* =========================================================
   ADMIN SETTINGS UPDATE
========================================================= */

export async function updateSettings(
  req: AuthedRequest,
  res: Response
) {

  const allowed =
    new Set([
      'currency',
      'minimumDeposit',
      'minimumWithdrawal',
      'withdrawalFeePercent',
      'commissionRates',
      'cycleIntervalHours',
      'packageDurationDays',
      'maintenanceMode',
      'supportEmail',
      'supportPhone'
    ]);

  const body: any = {};

  for (
    const [k, v] of Object.entries(
      req.body || {}
    )
  ) {

    if (
      !allowed.has(k)
    ) {
      continue;
    }

    body[k] =
      v;
  }

  if (
    body.minimumDeposit !==
    undefined &&
    (
      !Number.isFinite(
        Number(
          body.minimumDeposit
        )
      ) ||
      Number(
        body.minimumDeposit
      ) <= 0
    )
  ) {

    return res.status(400).json({
      message:
        'Invalid minimum deposit'
    });
  }

  if (
    body.minimumWithdrawal !==
    undefined &&
    (
      !Number.isFinite(
        Number(
          body.minimumWithdrawal
        )
      ) ||
      Number(
        body.minimumWithdrawal
      ) <= 0
    )
  ) {

    return res.status(400).json({
      message:
        'Invalid minimum withdrawal'
    });
  }

  if (
    body.withdrawalFeePercent !==
    undefined &&
    (
      !Number.isFinite(
        Number(
          body.withdrawalFeePercent
        )
      ) ||
      Number(
        body.withdrawalFeePercent
      ) < 0 ||
      Number(
        body.withdrawalFeePercent
      ) > 100
    )
  ) {

    return res.status(400).json({
      message:
        'Invalid withdrawal fee'
    });
  }

  if (
    body.cycleIntervalHours !==
    undefined &&
    (
      !Number.isFinite(
        Number(
          body.cycleIntervalHours
        )
      ) ||
      Number(
        body.cycleIntervalHours
      ) <= 0
    )
  ) {

    return res.status(400).json({
      message:
        'Invalid cycle interval'
    });
  }

  if (
    body.packageDurationDays !==
    undefined &&
    (
      !Number.isInteger(
        Number(
          body.packageDurationDays
        )
      ) ||
      Number(
        body.packageDurationDays
      ) <= 0
    )
  ) {

    return res.status(400).json({
      message:
        'Invalid package duration'
    });
  }

  if (
    body.commissionRates !==
    undefined &&
    (
      !Array.isArray(
        body.commissionRates
      ) ||
      body.commissionRates.length !==
        4 ||
      body.commissionRates.some(
        (x: any) =>
          !Number.isFinite(
            Number(x)
          ) ||
          Number(x) < 0 ||
          Number(x) > 100
      )
    )
  ) {

    return res.status(400).json({
      message:
        'Invalid commission rates'
    });
  }

  for (
    const [k, v] of Object.entries(
      body
    )
  ) {

    await setSetting(
      k,
      v
    );
  }

  await audit(
    req,
    'UPDATE',
    'SystemSetting',
    'platform',
    undefined,
    body
  );

  res.json(
    await getSettings()
  );
}















