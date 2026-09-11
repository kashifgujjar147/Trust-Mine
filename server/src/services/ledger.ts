import crypto from 'node:crypto';
import mongoose, {ClientSession} from 'mongoose';
import { env } from '../config/env.js';
import {Transaction,Wallet,User,Withdrawal} from '../models/index.js';

export function txid(prefix='TX'){return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`}
export function transactionUnsupported(error:unknown){const message=String((error as {message?:unknown})?.message||error);return /Transaction numbers are only allowed|replica set|does not support transactions|transaction is not supported/i.test(message)}
export async function withMongoTransaction<T>(work:(session:ClientSession)=>Promise<T>,_fallback?:()=>Promise<T>):Promise<T>{const session=await mongoose.startSession();try{let result!:T;await session.withTransaction(async()=>{result=await work(session)});return result}catch(error){if(transactionUnsupported(error)&&!env.MONGODB_TRANSACTIONS_REQUIRED){throw new Error('A transaction-capable MongoDB deployment is required for financial operations. Configure a replica set or sharded cluster.')}throw error}finally{await session.endSession()}}

const CREDIT_TYPES=['DEPOSIT','PACKAGE_INCOME','COMMISSION','REWARD','PROMO_REWARD','ADJUSTMENT','REFUND'] as const;
const DEBIT_TYPES=['WITHDRAWAL','WITHDRAWAL_FEE','PACKAGE_PURCHASE','REVERSAL'] as const;
const settled=['COMPLETED','PAID'];

async function rebuildWallet(userId:string,session?:ClientSession){
  const oid=new mongoose.Types.ObjectId(userId);
  const rows=await Transaction.aggregate([
    {$match:{userId:oid,status:{$in:settled}}},
    {$group:{_id:'$type',net:{$sum:{$ifNull:['$netAmount','$amount']}}}}
  ]).session(session||null);
  let total=0;
  for(const row of rows){if((CREDIT_TYPES as readonly string[]).includes(row._id))total+=Number(row.net||0);if((DEBIT_TYPES as readonly string[]).includes(row._id))total-=Number(row.net||0)}
  const pending=await Withdrawal.aggregate([{$match:{userId:oid,status:{$in:['PENDING','APPROVED','PROCESSING']}}},{$group:{_id:null,total:{$sum:{$ifNull:['$reservedAmount','$amount']}}}}]).session(session||null);
  const locked=Number(pending[0]?.total||0);
  total=Math.max(0,Number(total.toFixed(8)));
  return Wallet.findOneAndUpdate({userId:oid},{$set:{userId:oid,totalBalance:total,lockedWithdrawalAmount:locked}},{upsert:true,new:true,setDefaultsOnInsert:true,session});
}
export async function ensureWallet(userId:string,session?:ClientSession){const oid=new mongoose.Types.ObjectId(userId);const found=await Wallet.findOne({userId:oid}).session(session||null);return found||rebuildWallet(userId,session)}
export async function creditWallet(userId:string,amount:number,session?:ClientSession){if(!Number.isFinite(amount)||amount<=0)throw new Error('Invalid wallet credit');return Wallet.findOneAndUpdate({userId:new mongoose.Types.ObjectId(userId)},{$inc:{totalBalance:amount}},{upsert:true,new:true,setDefaultsOnInsert:true,session})}
export async function debitWallet(userId:string,amount:number,session?:ClientSession){if(!Number.isFinite(amount)||amount<=0)throw new Error('Invalid wallet debit');const r=await Wallet.findOneAndUpdate({userId:new mongoose.Types.ObjectId(userId),totalBalance:{$gte:amount}},{$inc:{totalBalance:-amount}},{new:true,session});if(!r)throw new Error('Insufficient wallet balance');return r}
export async function reserveWithdrawal(userId:string,amount:number,session?:ClientSession){const oid=new mongoose.Types.ObjectId(userId);await ensureWallet(userId,session);const r=await Wallet.findOneAndUpdate({userId:oid,$expr:{$gte:[{$subtract:[{$ifNull:['$totalBalance',0]},{$ifNull:['$lockedWithdrawalAmount',0]}]},amount]}},{$inc:{lockedWithdrawalAmount:amount}},{new:true,session});if(!r)throw new Error('Insufficient available balance');return r}
export async function releaseWithdrawal(userId:string,amount:number,session?:ClientSession){return Wallet.findOneAndUpdate({userId:new mongoose.Types.ObjectId(userId),lockedWithdrawalAmount:{$gte:amount}},{$inc:{lockedWithdrawalAmount:-amount}},{new:true,session})}
export async function getWallet(userId:string){return ensureWallet(userId)}
export async function finalizeWithdrawal(userId:string,amount:number,session?:ClientSession){const r=await Wallet.findOneAndUpdate({userId:new mongoose.Types.ObjectId(userId),lockedWithdrawalAmount:{$gte:amount},totalBalance:{$gte:amount}},{$inc:{lockedWithdrawalAmount:-amount,totalBalance:-amount}},{new:true,session});if(!r)throw new Error('Withdrawal reservation is invalid');return r}

export interface LedgerInput{userId:string;type:string;amount:number;fee?:number;netAmount?:number;status:string;reference?:string;description?:string;relatedEntity?:string;metadata?:Record<string,unknown>}
async function ledgerInSession(data:LedgerInput,session:ClientSession){
  if(!Number.isFinite(data.amount)||data.amount<=0)throw new Error('Ledger amount must be positive');
  const fee=Number(data.fee??0);
  const netAmount=Number(data.netAmount??(data.amount-fee));
  if(!Number.isFinite(fee)||fee<0)throw new Error('Ledger fee must be non-negative');
  if(!Number.isFinite(netAmount)||netAmount<0||Math.abs(netAmount-(data.amount-fee))>1e-8)throw new Error('Ledger netAmount must equal amount minus fee');
  const key=data.metadata?.idempotencyKey;
  if(key){const existing=await Transaction.findOne({'metadata.idempotencyKey':String(key)}).session(session);if(existing){if(existing.userId.toString()!==data.userId||existing.type!==data.type||existing.status!==data.status||Number(existing.amount)!==Number(data.amount))throw new Error('Idempotency key is already bound to a different transaction');return existing}}
  const tx=await Transaction.create([{transactionId:txid('LED'),fee,netAmount,...data}],{session}).then(rows=>rows[0]);
  if(settled.includes(data.status)&&((CREDIT_TYPES as readonly string[]).includes(data.type)))await creditWallet(data.userId,netAmount,session);
  if(settled.includes(data.status)&&((DEBIT_TYPES as readonly string[]).includes(data.type)))await debitWallet(data.userId,netAmount,session);
  return tx;
}
export async function ledger(data:LedgerInput,session?:ClientSession){
  if(session)return ledgerInSession(data,session);
  try{return await withMongoTransaction(s=>ledgerInSession(data,s))}catch(error:unknown){
    if((error as {code?:number})?.code===11000&&data.metadata?.idempotencyKey){
      const existing=await Transaction.findOne({'metadata.idempotencyKey':String(data.metadata.idempotencyKey)});
      if(existing)return existing;
    }
    throw error;
  }
}
export async function balanceSnapshot(userId:string){const w=await ensureWallet(userId);const total=Number(w?.totalBalance||0);const locked=Number(w?.lockedWithdrawalAmount||0);return {totalBalance:total,lockedWithdrawalAmount:locked,availableBalance:Math.max(0,Number((total-locked).toFixed(8)))} }
export async function balanceFor(userId:string){return (await balanceSnapshot(userId)).totalBalance}
export async function initializeWallets(){
  const users=await User.find().select('_id').lean();

  for(const user of users){
    await withMongoTransaction(
      session=>rebuildWallet(String(user._id),session)
    );
  }

  await Promise.all([
    Wallet.syncIndexes(),
    Transaction.syncIndexes(),
    Withdrawal.syncIndexes()
  ]);
}
