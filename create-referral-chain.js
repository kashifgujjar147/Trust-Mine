const http = require("http");

const BASE = "http://localhost:5000";
const ROOT_REFERRAL = "REF-ADMIN";

function post(path, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);

    const req = http.request(
      BASE + path,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body)
        }
      },
      res => {
        let raw = "";

        res.on("data", chunk => raw += chunk);

        res.on("end", () => {
          try {
            const json = JSON.parse(raw);
            resolve({
              status: res.statusCode,
              data: json
            });
          } catch {
            resolve({
              status: res.statusCode,
              data: raw
            });
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function register(level, referralCode) {
  const suffix = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  const payload = {
    fullName: `Referral Level ${level} Test`,
    username: `reflevel${level}_${suffix}`,
    email: `reflevel${level}_${suffix}@trustmine.test`,
    password: "Test@123456",
    referralCode
  };

  console.log(`\nCreating L${level} user...`);
  console.log(`Referral Code Used: ${referralCode}`);

  const result = await post("/api/auth/register", payload);

  console.log("HTTP:", result.status);

  if (result.status < 200 || result.status >= 300) {
    console.log("FAILED RESPONSE:");
    console.log(JSON.stringify(result.data, null, 2));
    throw new Error(`L${level} registration failed`);
  }

  console.log("SUCCESS");

  const user =
    result.data?.user ||
    result.data?.data?.user ||
    result.data?.data ||
    result.data;

  const newReferralCode =
    user?.referralCode ||
    result.data?.referralCode ||
    result.data?.data?.referralCode;

  if (!newReferralCode) {
    console.log("\nRegistration response:");
    console.log(JSON.stringify(result.data, null, 2));
    throw new Error(`Could not find referralCode for L${level}`);
  }

  console.log(`L${level} Referral Code: ${newReferralCode}`);

  return newReferralCode;
}

async function main() {
  console.log("\n============================================================");
  console.log("       TRUST-MINE L2 -> L3 -> L4 REFERRAL TEST");
  console.log("============================================================");

  console.log("\nRoot: Demo Admin");
  console.log("Root Referral Code:", ROOT_REFERRAL);

  // Existing L1 child must already exist.
  // We need its referral code.
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

  await mongoose.connect(process.env.MONGODB_URI);

  const root = await User.findOne({
    referralCode: ROOT_REFERRAL
  });

  if (!root) {
    throw new Error("Demo Admin not found");
  }

  const l1 = await User.findOne({
    referredBy: root._id
  });

  if (!l1) {
    throw new Error(
      "No L1 child found under Demo Admin. Existing L1 child is required."
    );
  }

  console.log("\nExisting L1:");
  console.log("Name:", l1.fullName);
  console.log("User ID:", l1.userId);
  console.log("Referral Code:", l1.referralCode);

  await mongoose.disconnect();

  // L1 referral code -> creates L2
  const l2Referral = await register(2, l1.referralCode);

  // L2 referral code -> creates L3
  const l3Referral = await register(3, l2Referral);

  // L3 referral code -> creates L4
  await register(4, l3Referral);

  console.log("\n============================================================");
  console.log("             RUNNING FINAL TREE VERIFICATION");
  console.log("============================================================\n");

  const { spawnSync } = require("child_process");

  const check = spawnSync(
    process.execPath,
    ["./referral-test.js", ROOT_REFERRAL],
    {
      stdio: "inherit"
    }
  );

  if (check.status !== 0) {
    throw new Error("Referral verification failed");
  }

  console.log("\n============================================================");
  console.log("                    TEST COMPLETE");
  console.log("============================================================");
  console.log("Expected:");
  console.log("L1 = 1");
  console.log("L2 = 1");
  console.log("L3 = 1");
  console.log("L4 = 1");
  console.log("Total Indirect = 3");
  console.log("Total Team = 4");
  console.log("============================================================\n");
}

main().catch(err => {
  console.error("\n[ERROR]", err.message);
  process.exit(1);
});
