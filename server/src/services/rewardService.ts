import mongoose,{ClientSession} from 'mongoose';
import {Reward,Transaction,RewardClaim} from '../models/index.js';
import {ledger,withMongoTransaction} from './ledger.js';

export async function qualifyingVolume(userId:string,session?:ClientSession){const rows=await Transaction.aggregate([{$match:{userId:new mongoose.Types.ObjectId(userId),type:'DEPOSIT',status:'COMPLETED'}},{$group:{_id:null,total:{$sum:'$amount'}}}]).session(session||null);return Number(rows[0]?.total||0)}
export async function eligibleRewards(userId:string,session?:ClientSession){const value=await qualifyingVolume(userId,session);return Reward.find({status:'ACTIVE',threshold:{$lte:value}}).sort({threshold:1}).session(session||null)}
export async function claimReward(userId:string,rewardId:string){
 const reward=await Reward.findOne({_id:rewardId,status:'ACTIVE'});if(!reward)throw Error('Reward not found');
 const work=async(session:ClientSession)=>{const eligible=await eligibleRewards(userId,session);if(!eligible.some(x=>String(x._id)===rewardId))throw Object.assign(new Error('Reward not eligible'),{statusCode:409});const reference=`REWARD-${rewardId}-${userId}`;const existing=await Transaction.findOne({userId,type:'REWARD',reference,status:'COMPLETED'}).session(session);if(existing)return existing;try{await RewardClaim.create([{userId,rewardId,reference}],{session})}catch(e:unknown){if((e as {code?:number})?.code===11000){const prior=await Transaction.findOne({userId,type:'REWARD',reference,status:'COMPLETED'}).session(session);if(prior)return prior;throw Object.assign(new Error('Reward claim is already being processed'),{statusCode:409})}throw e}return ledger({userId,type:'REWARD',amount:reward.reward,status:'COMPLETED',reference,metadata:{rewardId,claimReference:reference,qualifyingVolume:await qualifyingVolume(userId,session),idempotencyKey:`reward:${userId}:${rewardId}`}},session)};
 return withMongoTransaction(work);
}
