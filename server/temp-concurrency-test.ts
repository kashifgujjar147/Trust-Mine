import mongoose from "mongoose";
import { env } from "./src/config/env.js";
import { PackagePurchase, Transaction } from "./src/models/index.js";
import { processCycle } from "./src/services/incomeService.js";

const packagePurchaseId = "6aa28c27b75e544b70657226";

await mongoose.connect(env.MONGODB_URI);

await PackagePurchase.updateOne(
  {
    _id: packagePurchaseId,
    status: "ACTIVE"
  },
  {
    $set: {
      nextProcessAt: new Date(Date.now() - 60 * 1000)
    }
  }
);

console.log("Package forced due.");

const before = await Transaction.countDocuments({
  userId: "6aa28b29b75e544b7065720d",
  type: "PACKAGE_INCOME"
});

console.log("Income transactions BEFORE:", before);

const fakePurchase = {
  _id: new mongoose.Types.ObjectId(packagePurchaseId)
};

const results = await Promise.allSettled([
  processCycle(fakePurchase),
  processCycle(fakePurchase)
]);

console.log("Concurrent results:");
console.log(
  results.map((r, i) => ({
    call: i + 1,
    status: r.status,
    value:
      r.status === "fulfilled"
        ? r.value
          ? {
              currentCycle: r.value.currentCycle,
              completedCycles: r.value.completedCycles,
              accruedAmount: r.value.accruedAmount
            }
          : null
        : String(r.reason)
  }))
);

const after = await Transaction.countDocuments({
  userId: "6aa28b29b75e544b7065720d",
  type: "PACKAGE_INCOME"
});

const incomes = await Transaction.find({
  userId: "6aa28b29b75e544b7065720d",
  type: "PACKAGE_INCOME"
}).sort({ createdAt: 1 });

const packageState = await PackagePurchase.findById(packagePurchaseId);

console.log("Income transactions AFTER:", after);
console.log("New income transactions:", after - before);

console.log("Package state:");
console.log({
  currentCycle: packageState?.currentCycle,
  completedCycles: packageState?.completedCycles,
  accruedAmount: packageState?.accruedAmount,
  nextProcessAt: packageState?.nextProcessAt
});

console.log("Income transactions:");
console.log(
  incomes.map(x => ({
    amount: x.amount,
    description: x.description,
    idempotencyKey: x.metadata?.idempotencyKey
  }))
);

await mongoose.disconnect();
