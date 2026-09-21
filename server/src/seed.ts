import {connectDB} from './config/db.js';
import {User,Package,Reward,PromoCode,PaymentMethod,Transaction,SystemSetting,Wallet,Deposit,Withdrawal,PackagePurchase,Commission,PromoUsage,PromoUserCounter,RewardClaim,Notification,SupportTicket,AuditLog} from './models/index.js';
import {hash} from './utils/auth.js';
import {env} from './config/env.js';
const packages=[['Starter House',2,.08],['Dream House',5,.2],['Family House',10,.4],['Modern House',20,.8],['Luxury House',50,2],['Premium Residence',100,4],['Grand Residence',250,10],['Royal Residence',500,20]];
async function main(){if(env.NODE_ENV==='production')throw new Error('Refusing to run destructive seed in production.');await connectDB();await Promise.all([User.deleteMany({}),Package.deleteMany({}),Reward.deleteMany({}),PromoCode.deleteMany({}),PaymentMethod.deleteMany({}),Transaction.deleteMany({}),SystemSetting.deleteMany({}),Wallet.deleteMany({}),Deposit.deleteMany({}),Withdrawal.deleteMany({}),PackagePurchase.deleteMany({}),Commission.deleteMany({}),PromoUsage.deleteMany({}),PromoUserCounter.deleteMany({}),RewardClaim.deleteMany({}),Notification.deleteMany({}),SupportTicket.deleteMany({}),AuditLog.deleteMany({})]);const admin=await User.create({fullName:'Demo Admin',username:'demo-admin',email:'admin@trustmine.demo',passwordHash:await hash('Admin@12345'),userId:'TM-ADMIN01',referralCode:'REF-ADMIN',role:'ADMIN',status:'ACTIVE'});const user=await User.create({fullName:'Demo User',username:'demo-user',email:'user@trustmine.demo',passwordHash:await hash('User@12345'),userId:'TM-USER001',referralCode:'REF-USER01',role:'USER',status:'ACTIVE'});await Package.insertMany(packages.map(([name,amount,daily],i)=>({name,amount,cycleDays:365,incomeConfiguration:{daily,total:Number(daily)*365},description:'Illustrative configurable package rule for demo/testing.',status:'ACTIVE',sortOrder:i+1})));await Reward.deleteMany({});

await Reward.insertMany([
  {
    rank: 1,
    name: 'Bronze Partner',
    selfBusiness: 10,
    directRequired: 5,
    indirectRequired: 10,
    teamRequired: 15,
    threshold: 50,
    reward: 1,
    status: 'ACTIVE',
    sortOrder: 1
  },
  {
    rank: 2,
    name: 'Silver Star',
    selfBusiness: 20,
    directRequired: 10,
    indirectRequired: 20,
    teamRequired: 30,
    threshold: 100,
    reward: 3,
    status: 'ACTIVE',
    sortOrder: 2
  },
  {
    rank: 3,
    name: 'Gold Executive',
    selfBusiness: 40,
    directRequired: 15,
    indirectRequired: 40,
    teamRequired: 55,
    threshold: 250,
    reward: 8,
    status: 'ACTIVE',
    sortOrder: 3
  },
  {
    rank: 4,
    name: 'Platinum Leader',
    selfBusiness: 80,
    directRequired: 20,
    indirectRequired: 80,
    teamRequired: 100,
    threshold: 500,
    reward: 20,
    status: 'ACTIVE',
    sortOrder: 4
  },
  {
    rank: 5,
    name: 'Ruby Manager',
    selfBusiness: 150,
    directRequired: 25,
    indirectRequired: 150,
    teamRequired: 175,
    threshold: 1000,
    reward: 50,
    status: 'ACTIVE',
    sortOrder: 5
  },
  {
    rank: 6,
    name: 'Sapphire Director',
    selfBusiness: 300,
    directRequired: 30,
    indirectRequired: 300,
    teamRequired: 330,
    threshold: 2500,
    reward: 120,
    status: 'ACTIVE',
    sortOrder: 6
  },
  {
    rank: 7,
    name: 'Emerald Elite',
    selfBusiness: 500,
    directRequired: 35,
    indirectRequired: 500,
    teamRequired: 535,
    threshold: 5000,
    reward: 300,
    status: 'ACTIVE',
    sortOrder: 7
  },
  {
    rank: 8,
    name: 'Diamond Ambassador',
    selfBusiness: 1000,
    directRequired: 40,
    indirectRequired: 800,
    teamRequired: 840,
    threshold: 10000,
    reward: 700,
    status: 'ACTIVE',
    sortOrder: 8
  },
  {
    rank: 9,
    name: 'Crown Diamond',
    selfBusiness: 2000,
    directRequired: 45,
    indirectRequired: 1200,
    teamRequired: 1245,
    threshold: 25000,
    reward: 1500,
    status: 'ACTIVE',
    sortOrder: 9
  },
  {
    rank: 10,
    name: 'Royal Crown Legend',
    selfBusiness: 5000,
    directRequired: 50,
    indirectRequired: 2000,
    teamRequired: 2050,
    threshold: 50000,
    reward: 3500,
    status: 'ACTIVE',
    sortOrder: 10
  }
]);await PromoCode.create({code:'WELCOME10',rewardType:'FIXED',rewardValue:10,usageLimit:100,perUserLimit:1,minRequirement:0,status:'ACTIVE'});await PaymentMethod.insertMany([{code:'EASYPAISA',name:'Easypaisa',instructions:'Use the configured merchant/account details and submit the provider reference. Admin/provider verification is required.',accountDetails:'DEMO-MERCHANT',minAmount:2,displayOrder:1,verificationMode:'MANUAL'},{code:'BEP20',name:'BEP20',instructions:'Send only through the configured BNB Smart Chain/BEP20 route in production. Submit the transaction hash for backend verification.',accountDetails:'DEMO_BEP20_WALLET',minAmount:2,displayOrder:2,verificationMode:'MANUAL'},{code:'BANK',name:'Bank Transfer',instructions:'Use the configured bank details and submit the transfer reference/proof for verification.',accountDetails:'DEMO BANK / IBAN CONFIG',minAmount:2,displayOrder:3,verificationMode:'MANUAL'},{code:'CUSTOM',name:'Custom Method',instructions:'Administrator-configurable payment instructions.',accountDetails:'CONFIGURE IN ADMIN',minAmount:2,displayOrder:4,verificationMode:'MANUAL'}]);await SystemSetting.insertMany([{key:'currency',value:'USD'},{key:'minimumDeposit',value:2},{key:'minimumWithdrawal',value:1},{key:'withdrawalFeePercent',value:8},{key:'commissionRates',value:[10,2,1,1]},{key:'cycleIntervalHours',value:24},{key:'packageDurationDays',value:365},{key:'maintenanceMode',value:false},{key:'supportEmail',value:'support@trustmine.example'},{key:'supportPhone',value:'+1 000 000 0000'}]);console.log('Seed complete. Admin:',admin.email,'User:',user.email);process.exit(0)}main().catch(e=>{console.error(e);process.exit(1)});
