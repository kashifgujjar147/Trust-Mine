import 'dotenv/config';
import { connectDB } from '../config/db.js';
import { PaymentMethod } from '../models/index.js';

async function main() {
  await connectDB();

  const methods = [
    {
      code: 'upaisa',
      name: 'UPaisa',
      instructions: 'Send the exact deposit amount to the configured UPaisa account. After payment, enter the transaction/reference ID. The deposit will remain pending until admin verification.',
      accountDetails: process.env.UPAISA_ACCOUNT_DETAILS || 'CONFIGURE_UPAISA_ACCOUNT',
      minAmount: 2,
      displayOrder: 5,
      verificationMode: 'MANUAL'
    },
    {
      code: 'opay',
      name: 'OPay',
      instructions: 'Send the exact deposit amount to the configured OPay account. After payment, enter the transaction/reference ID. The deposit will remain pending until admin verification.',
      accountDetails: process.env.OPAY_ACCOUNT_DETAILS || 'CONFIGURE_OPAY_ACCOUNT',
      minAmount: 2,
      displayOrder: 6,
      verificationMode: 'MANUAL'
    },
    {
      code: 'digit_wallet',
      name: 'Digit Wallet',
      instructions: 'Send the exact deposit amount to the configured Digit Wallet account. After payment, enter the transaction/reference ID. The deposit will remain pending until admin verification.',
      accountDetails: process.env.DIGIT_WALLET_ACCOUNT_DETAILS || 'CONFIGURE_DIGIT_WALLET_ACCOUNT',
      minAmount: 2,
      displayOrder: 7,
      verificationMode: 'MANUAL'
    }
  ];

  for (const method of methods) {
    await PaymentMethod.findOneAndUpdate(
      { code: method.code },
      method,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  console.log('UPaisa, OPay and Digit Wallet configured successfully.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
