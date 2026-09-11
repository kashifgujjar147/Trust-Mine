const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config({ path: "./server/.env" });

const User = mongoose.model(
  "User",
  new mongoose.Schema({
    fullName: String,
    userId: String,
    referredBy: mongoose.Schema.Types.ObjectId,
    status: String
  })
);

const PackagePurchase = mongoose.model(
  "PackagePurchase",
  new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    packageAmount: Number,
    status: String
  })
);

const Commission = mongoose.model(
  "Commission",
  new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    sourceUserId: mongoose.Schema.Types.ObjectId,
    level: Number,
    rate: Number,
    amount: Number,
    transactionId: String
  })
);

async function main() {

  await mongoose.connect(process.env.MONGODB_URI);

  const root = await User.findOne({
    userId: "TM-ADMIN01"
  }).lean();

  if (!root) {
    throw new Error("Demo Admin not found");
  }

  const users = await User.find({}).lean();

  const children = new Map();

  for (const u of users) {

    if (!u.referredBy) continue;

    const parent = String(u.referredBy);

    if (!children.has(parent)) {
      children.set(parent, []);
    }

    children.get(parent).push(u);
  }

  const levels = {
    1: [],
    2: [],
    3: [],
    4: []
  };

  const queue = [
    {
      user: root,
      level: 0
    }
  ];

  const visited = new Set([
    String(root._id)
  ]);

  while (queue.length) {

    const current = queue.shift();

    if (current.level >= 4) continue;

    const kids =
      children.get(String(current.user._id)) || [];

    for (const child of kids) {

      const id = String(child._id);

      if (visited.has(id)) continue;

      visited.add(id);

      const level = current.level + 1;

      if (level <= 4) {

        levels[level].push(child);

        queue.push({
          user: child,
          level
        });
      }
    }
  }

  const allIds = [
    root._id,
    ...levels[1].map(x => x._id),
    ...levels[2].map(x => x._id),
    ...levels[3].map(x => x._id),
    ...levels[4].map(x => x._id)
  ];

  const purchases = await PackagePurchase.find({
    userId: { $in: allIds },
    status: "ACTIVE"
  }).lean();

  const business = new Map();

  for (const p of purchases) {

    const id = String(p.userId);

    business.set(
      id,
      (business.get(id) || 0) +
      Number(p.packageAmount || 0)
    );
  }

  const selfBusiness =
    business.get(String(root._id)) || 0;

  let directBusiness = 0;
  let indirectBusiness = 0;

  for (const u of levels[1]) {
    directBusiness +=
      business.get(String(u._id)) || 0;
  }

  for (const level of [2,3,4]) {

    for (const u of levels[level]) {

      indirectBusiness +=
        business.get(String(u._id)) || 0;
    }
  }

  const totalBusiness =
    selfBusiness +
    directBusiness +
    indirectBusiness;

  const commissions = await Commission.find({
    sourceUserId: {
      $in: allIds
    }
  }).lean();

  const duplicateMap = new Map();

  for (const c of commissions) {

    const key =
      String(c.sourceUserId) +
      "|" +
      String(c.level) +
      "|" +
      String(c.transactionId);

    duplicateMap.set(
      key,
      (duplicateMap.get(key) || 0) + 1
    );
  }

  const duplicates = [
    ...duplicateMap.entries()
  ].filter(x => x[1] > 1);

  console.log("");
  console.log("============================================================");
  console.log(" REAL DATABASE RESULT");
  console.log("============================================================");

  console.log("L1:", levels[1].length);
  console.log("L2:", levels[2].length);
  console.log("L3:", levels[3].length);
  console.log("L4:", levels[4].length);

  console.log("");
  console.log("Self Business:", selfBusiness);
  console.log("Direct Business:", directBusiness);
  console.log("Indirect Business:", indirectBusiness);
  console.log("Total Business:", totalBusiness);

  console.log("");
  console.log("Commission Records:", commissions.length);
  console.log("Duplicate Commissions:", duplicates.length);

  console.log("");
  console.log("============================================================");

  if (duplicates.length === 0) {
    console.log("[PASS] No duplicate commissions");
  } else {
    console.log("[FAIL] Duplicate commissions detected");
  }

  console.log("============================================================");

  await mongoose.disconnect();
}

main().catch(async e => {

  console.error("[ERROR]", e.message);

  await mongoose.disconnect().catch(() => {});

  process.exit(1);
});
