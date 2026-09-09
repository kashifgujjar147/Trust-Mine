import mongoose from 'mongoose';
import { env } from './server/dist/config/env.js';
import { PackagePurchase } from './server/dist/models/index.js';
import { processCycle } from './server/dist/services/incomeService.js';

await mongoose.connect(env.MONGODB_URI);

const id = '6aa1a41e654b60d671add887';

const before = await PackagePurchase.findById(id).lean();

console.log('BEFORE:');
console.log(JSON.stringify({
  status: before?.status,
  currentCycle: before?.currentCycle,
  completedCycles: before?.completedCycles,
  accruedAmount: before?.accruedAmount,
  nextProcessAt: before?.nextProcessAt
}, null, 2));

const result = await processCycle({ _id: id });

console.log('\nPROCESS RESULT:');
console.log(JSON.stringify({
  status: result?.status,
  currentCycle: result?.currentCycle,
  completedCycles: result?.completedCycles,
  accruedAmount: result?.accruedAmount,
  nextProcessAt: result?.nextProcessAt,
  lastProcessedAt: result?.lastProcessedAt
}, null, 2));

await mongoose.disconnect();
