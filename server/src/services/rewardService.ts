import mongoose, { ClientSession } from 'mongoose';
import { Reward, Transaction, RewardClaim, User } from '../models/index.js';
import { ledger, withMongoTransaction } from './ledger.js';

export type RewardProgress = {
  selfBusiness: number;
  direct: number;
  indirect: number;
  team: number;
};

export async function qualifyingVolume(
  userId: string,
  session?: ClientSession
) {
  const rows = await Transaction.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        type: 'DEPOSIT',
        status: 'COMPLETED'
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: '$amount' }
      }
    }
  ]).session(session || null);

  return Number(rows[0]?.total || 0);
}

/**
 * Direct = users directly referred by this user.
 * Indirect = active descendants from level 2 onward.
 * Team = direct + indirect.
 */
export async function teamProgress(
  userId: string,
  session?: ClientSession
): Promise<RewardProgress> {
  const selfBusiness = await qualifyingVolume(userId, session);

  /*
   * Existing platform team structure:
   * L1 = Direct
   * L2-L4 = Indirect
   */
  const rootId = new mongoose.Types.ObjectId(userId);

  const rows = await User.aggregate([
    {
      $match: {
        _id: rootId
      }
    },
    {
      $graphLookup: {
        from: 'users',
        startWith: '$_id',
        connectFromField: '_id',
        connectToField: 'referredBy',
        as: 'descendants',
        maxDepth: 3,
        depthField: 'networkDepth'
      }
    },
    {
      $project: {
        descendants: 1
      }
    }
  ]).session(session || null);

  let direct = 0;
  let indirect = 0;

  for (const member of rows[0]?.descendants || []) {
    const level = Number(member.networkDepth || 0) + 1;

    if (level === 1) {
      direct++;
    } else if (level >= 2 && level <= 4) {
      indirect++;
    }
  }

  return {
    selfBusiness,
    direct,
    indirect,
    team: direct + indirect
  };
}

export async function eligibleRewards(
  userId: string,
  session?: ClientSession
) {
  const progress = await teamProgress(userId, session);

  const rewards = await Reward.find({
    status: 'ACTIVE'
  })
    .sort({ rank: 1 })
    .session(session || null);

  return rewards.filter(
    reward =>
      progress.selfBusiness >= Number(reward.selfBusiness) &&
      progress.direct >= Number(reward.directRequired) &&
      progress.indirect >= Number(reward.indirectRequired) &&
      progress.team >= Number(reward.teamRequired)
  );
}
export async function getRewardProgress(
  userId: string,
  session?: ClientSession
) {
  const progress = await teamProgress(userId, session);

  const rewards = await Reward.find({
    status: 'ACTIVE'
  })
    .sort({ rank: 1 })
    .session(session || null);

  const eligible = rewards.filter(
    reward =>
      progress.selfBusiness >= Number(reward.selfBusiness) &&
      progress.direct >= Number(reward.directRequired) &&
      progress.indirect >= Number(reward.indirectRequired) &&
      progress.team >= Number(reward.teamRequired)
  );

  return {
    progress,
    rewards,
    eligible
  };
}

export async function claimReward(
  userId: string,
  rewardId: string
) {
  const work = async (session: ClientSession) => {
    const reward = await Reward.findOne({
      _id: rewardId,
      status: 'ACTIVE'
    }).session(session);

    if (!reward) {
      throw Object.assign(
        new Error('Reward not found'),
        { statusCode: 404 }
      );
    }

    const reference = `REWARD-${rewardId}-${userId}`;

    const existing = await Transaction.findOne({
      userId,
      type: 'REWARD',
      reference,
      status: 'COMPLETED'
    }).session(session);

    if (existing) {
      return existing;
    }

    const progress = await teamProgress(userId, session);

    const eligible =
      progress.selfBusiness >= Number(reward.selfBusiness) &&
      progress.direct >= Number(reward.directRequired) &&
      progress.indirect >= Number(reward.indirectRequired) &&
      progress.team >= Number(reward.teamRequired);

    if (!eligible) {
      throw Object.assign(
        new Error('Reward requirements not met'),
        { statusCode: 409 }
      );
    }

    try {
      await RewardClaim.create(
        [{
          userId,
          rewardId,
          reference
        }],
        { session }
      );
    } catch (e: unknown) {
      if ((e as { code?: number })?.code === 11000) {
        const prior = await Transaction.findOne({
          userId,
          type: 'REWARD',
          reference,
          status: 'COMPLETED'
        }).session(session);

        if (prior) return prior;

        throw Object.assign(
          new Error('Reward claim is already being processed'),
          { statusCode: 409 }
        );
      }

      throw e;
    }

    return ledger(
      {
        userId,
        type: 'REWARD',
        amount: Number(reward.reward),
        status: 'COMPLETED',
        reference,
        metadata: {
          rewardId: String(reward._id),
          rank: Number(reward.rank),
          rewardName: reward.name,
          qualifyingVolume: progress.selfBusiness,
          selfBusiness: progress.selfBusiness,
          direct: progress.direct,
          indirect: progress.indirect,
          team: progress.team,
          idempotencyKey: `reward:${userId}:${rewardId}`
        }
      },
      session
    );
  };

  return withMongoTransaction(work);
}
