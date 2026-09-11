const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config({ path: "./server/.env" });

const User = mongoose.model(
  "User",
  new mongoose.Schema({
    fullName: String,
    username: String,
    email: String,
    userId: String,
    referralCode: String,
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    status: String
  })
);

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  console.log("\n============================================================");
  console.log("        TRUST-MINE REAL REFERRAL TREE TEST");
  console.log("============================================================\n");

  const users = await User.find({})
    .select("fullName username email userId referralCode referredBy status createdAt")
    .lean();

  console.log(`[DATABASE] Total Users: ${users.length}\n`);

  const byId = new Map(
    users.map(u => [String(u._id), u])
  );

  const childrenMap = new Map();

  for (const user of users) {
    if (!user.referredBy) continue;

    const parentId = String(user.referredBy);

    if (!childrenMap.has(parentId)) {
      childrenMap.set(parentId, []);
    }

    childrenMap.get(parentId).push(user);
  }

  // Show users who have no parent = possible root accounts
  const roots = users.filter(u => !u.referredBy);

  console.log("ROOT / TOP LEVEL USERS:");
  console.log("------------------------------------------------------------");

  for (const root of roots) {
    console.log(
      `${root.fullName} | ${root.userId} | REF: ${root.referralCode}`
    );
  }

  console.log("\n============================================================");
  console.log("SELECT ROOT USER");
  console.log("============================================================");

  const input = process.argv[2];

  if (!input) {
    console.log("\nUsage:");
    console.log(
      'node referral-test.js "REFERRAL_CODE"'
    );
    console.log(
      'Example: node referral-test.js "REF-ADMIN"'
    );

    await mongoose.disconnect();
    return;
  }

  const root =
    users.find(u => u.referralCode === input) ||
    users.find(u => u.userId === input) ||
    users.find(u => String(u._id) === input);

  if (!root) {
    console.log(`\n[FAIL] User not found: ${input}`);
    await mongoose.disconnect();
    return;
  }

  console.log(
    `\nROOT: ${root.fullName} | ${root.userId} | REF: ${root.referralCode}`
  );

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

  const visited = new Set([String(root._id)]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.level >= 4) continue;

    const children =
      childrenMap.get(String(current.user._id)) || [];

    for (const child of children) {
      const childId = String(child._id);

      if (visited.has(childId)) continue;

      visited.add(childId);

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

  for (const level of [1, 2, 3, 4]) {
    console.log("\n============================================================");
    console.log(`LEVEL ${level} ${level === 1 ? "(DIRECT)" : "(INDIRECT)"}`);
    console.log("============================================================");

    console.log(`COUNT: ${levels[level].length}`);

    if (levels[level].length === 0) {
      console.log("NONE");
      continue;
    }

    for (const user of levels[level]) {
      console.log(
        `NAME: ${user.fullName} | USER ID: ${user.userId} | USERNAME: ${user.username} | STATUS: ${user.status} | REF: ${user.referralCode}`
      );
    }
  }

  const direct = levels[1].length;
  const indirect =
    levels[2].length +
    levels[3].length +
    levels[4].length;

  const total =
    direct +
    indirect;

  console.log("\n============================================================");
  console.log("                    FINAL RESULT");
  console.log("============================================================");

  console.log(`Direct Members (L1) : ${direct}`);
  console.log(`Indirect L2         : ${levels[2].length}`);
  console.log(`Indirect L3         : ${levels[3].length}`);
  console.log(`Indirect L4         : ${levels[4].length}`);
  console.log(`Total Indirect      : ${indirect}`);
  console.log(`Total Team          : ${total}`);

  console.log("\n============================================================");

  if (indirect > 0) {
    console.log("[PASS] INDIRECT REFERRALS EXIST");
    console.log("[PASS] L2/L3/L4 members are being detected");
  } else {
    console.log("[INFO] No indirect referrals found for this root user");
    console.log("[INFO] This may simply mean no L2/L3/L4 users exist yet");
  }

  console.log("============================================================\n");

  await mongoose.disconnect();
}

main().catch(async err => {
  console.error("\n[ERROR]", err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
