import mongoose from 'mongoose';
import { env } from './dist/config/env.js';
import { PackagePurchase } from './dist/models/index.js';

await mongoose.connect(env.MONGODB_URI);

const id = '6aa1a41e654b60d671add887';

const result = await PackagePurchase.findOneAndUpdate(
  {
    _id: id,
    status: 'ACTIVE'
  },
  {
    $set: {
      nextProcessAt: new Date(Date.now() - 60000)
    }
  },
  { new: true }
);

if (!result) {
  console.log('PackagePurchase not found or not ACTIVE');
} else {
  console.log(JSON.stringify({
    id: String(result._id),
    status: result.status,
    currentCycle: result.currentCycle,
    completedCycles: result.completedCycles,
    accruedAmount: result.accruedAmount,
    nextProcessAt: result.nextProcessAt
  }, null, 2));
}

await mongoose.disconnect();
