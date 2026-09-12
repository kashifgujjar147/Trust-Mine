import mongoose,{Schema,model} from 'mongoose';
const opts={timestamps:true};
export const User=model('User',new Schema({fullName:{type:String,required:true,trim:true},username:{type:String,required:true,unique:true},email:{type:String,required:true,unique:true,lowercase:true},phone:String,passwordHash:{type:String,required:true},userId:{type:String,required:true,unique:true},referralCode:{type:String,required:true,unique:true},referredBy:{type:Schema.Types.ObjectId,ref:'User',index:true},role:{type:String,enum:['USER','ADMIN'],default:'USER',index:true},status:{type:String,enum:['ACTIVE','DISABLED'],default:'ACTIVE',index:true},lastWithdrawalAt:Date,telegramChatId:{type:String,unique:true,sparse:true},telegramLinkCodeHash:String,telegramLinkExpiresAt:Date,tokenVersion:{type:Number,default:0,min:0}},opts));
export const PasswordResetToken=model('PasswordResetToken',new Schema({userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},tokenHash:{type:String,required:true,unique:true},expiresAt:{type:Date,required:true,index:true},usedAt:Date},{...opts,indexes:[{expiresAt:1},{userId:1,expiresAt:-1}]}));export const Wallet=model('Wallet',new Schema({userId:{type:Schema.Types.ObjectId,ref:'User',required:true,unique:true},totalBalance:{type:Number,default:0,min:0},lockedWithdrawalAmount:{type:Number,default:0,min:0}},{...opts}));
export const Package=model('Package',new Schema({name:{type:String,required:true},amount:{type:Number,required:true,min:0.00000001},cycleDays:{type:Number,default:1,min:1},incomeConfiguration:{daily:{type:Number,required:true,min:0},total:Number},description:{type:String,default:''},image:String,status:{type:String,enum:['ACTIVE','DISABLED','ARCHIVED'],default:'ACTIVE',index:true},sortOrder:{type:Number,default:0,index:true}},{...opts,indexes:[{status:1,sortOrder:1}]}));
export const PackagePurchase=model('PackagePurchase',new Schema({userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},packageId:{type:Schema.Types.ObjectId,ref:'Package',required:true,index:true},packageAmount:Number,paymentId:{type:Schema.Types.ObjectId,ref:'Deposit',unique:true,sparse:true},status:{type:String,enum:['PENDING','ACTIVE','EXPIRED','CANCELLED'],default:'PENDING',index:true},activatedAt:Date,cycleStart:Date,cycleEnd:Date,dailyIncomeSnapshot:{type:Number,min:0},cycleDaysSnapshot:{type:Number,min:1},lastProcessedAt:Date,nextProcessAt:{type:Date,index:true},currentCycle:{type:Number,default:0},completedCycles:{type:Number,default:0},accruedAmount:{type:Number,default:0}},{...opts,indexes:[{userId:1,status:1},{nextProcessAt:1,status:1},{userId:1,packageId:1,paymentId:1}]}));
export const Deposit=model('Deposit',new Schema({transactionId:{type:String,unique:true},userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},packageId:{type:Schema.Types.ObjectId,ref:'Package',required:true,index:true},amount:{type:Number,required:true},method:{type:String,required:true},reference:{type:String,required:true,unique:true,sparse:true},proofUrl:String,status:{type:String,enum:['PENDING','PROCESSING','COMPLETED','REJECTED','FAILED','CANCELLED'],default:'PENDING',index:true},verifiedAt:Date,verifiedBy:{type:Schema.Types.ObjectId,ref:'User'}},{...opts,indexes:[{userId:1,createdAt:-1},{status:1,createdAt:-1}]}));
export const Withdrawal=model('Withdrawal',new Schema({transactionId:{type:String,unique:true},userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},amount:{type:Number,required:true},fee:{type:Number,required:true},netAmount:{type:Number,required:true},method:{type:String,required:true},account:{type:String,required:true},accountHolderName:{type:String,required:true,trim:true},status:{type:String,enum:['PENDING','PROCESSING','APPROVED','REJECTED','COMPLETED','FAILED'],default:'PENDING',index:true},approvedBy:{type:Schema.Types.ObjectId,ref:'User'},rejectedBy:{type:Schema.Types.ObjectId,ref:'User'},processedAt:Date,reference:String,idempotencyKey:{type:String,unique:true,sparse:true},reservedAmount:{type:Number,required:true,min:0}},{...opts,indexes:[{userId:1,createdAt:-1},{status:1,createdAt:-1}]}));
export const Transaction=model('Transaction',new Schema({transactionId:{type:String,unique:true},userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},type:{type:String,enum:['DEPOSIT','PACKAGE_PURCHASE','PACKAGE_INCOME','WITHDRAWAL','WITHDRAWAL_FEE','COMMISSION','REWARD','PROMO_REWARD','ADJUSTMENT','REFUND','REVERSAL'],required:true,index:true},amount:{type:Number,required:true},fee:{type:Number,default:0},netAmount:{type:Number},status:{type:String,index:true},reference:{type:String,index:true},description:String,relatedEntity:String,metadata:Schema.Types.Mixed},{...opts,indexes:[{userId:1,createdAt:-1},{type:1,status:1,createdAt:-1},{reference:1},{'metadata.idempotencyKey':1,unique:true,sparse:true}]}));
export const Commission=model('Commission',new Schema({userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},sourceUserId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},level:{type:Number,required:true},rate:{type:Number,required:true},amount:{type:Number,required:true},transactionId:{type:String,index:true}},{...opts,indexes:[{userId:1,level:1},{sourceUserId:1,level:1,transactionId:1,unique:true}]}));
export const Reward=model('Reward',new Schema({threshold:{type:Number,required:true},reward:{type:Number,required:true},status:{type:String,default:'ACTIVE',index:true},sortOrder:Number},{...opts,indexes:[{status:1,threshold:1},{threshold:1,unique:true}]}));
export const PromoCode=model('PromoCode',new Schema({code:{type:String,unique:true},rewardType:String,rewardValue:Number,usageLimit:Number,perUserLimit:Number,minRequirement:{type:Number,default:0},expiresAt:Date,usageCount:{type:Number,default:0,min:0},status:{type:String,default:'ACTIVE',index:true}},{...opts,indexes:[{createdAt:-1}]}));
export const PromoUsage=model('PromoUsage',new Schema({promoCodeId:{type:Schema.Types.ObjectId,ref:'PromoCode',index:true},userId:{type:Schema.Types.ObjectId,ref:'User',index:true},reward:Number,usageKey:{type:String}},{...opts,indexes:[{promoCodeId:1,userId:1},{usageKey:1,unique:true,sparse:true}]}));
export const PromoUserCounter=model('PromoUserCounter',new Schema({promoCodeId:{type:Schema.Types.ObjectId,ref:'PromoCode',required:true},userId:{type:Schema.Types.ObjectId,ref:'User',required:true},count:{type:Number,default:0,min:0}},{...opts,indexes:[{promoCodeId:1,userId:1,unique:true}]}));
export const RewardClaim=model('RewardClaim',new Schema({userId:{type:Schema.Types.ObjectId,ref:'User',required:true},rewardId:{type:Schema.Types.ObjectId,ref:'Reward',required:true},reference:{type:String,required:true}},{...opts,indexes:[{userId:1,rewardId:1,unique:true},{reference:1,unique:true}]}));
export const PaymentMethod=model('PaymentMethod',new Schema({code:{type:String,unique:true},name:String,status:{type:String,default:'ACTIVE',index:true},instructions:String,accountDetails:String,minAmount:{type:Number,default:0},displayOrder:{type:Number,default:0},verificationMode:{type:String,enum:['MANUAL','AUTOMATIC'],default:'MANUAL'}},{...opts,indexes:[{status:1,displayOrder:1}]}));
export const Notification=model('Notification',new Schema({userId:{type:Schema.Types.ObjectId,ref:'User',index:true},title:String,message:String,read:{type:Boolean,default:false},type:String},{...opts,indexes:[{userId:1,createdAt:-1}]}));
export const SupportTicket=model('SupportTicket',new Schema({
  userId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  subject:{type:String,required:true,trim:true,maxlength:150},
  message:{type:String,required:true,trim:true,maxlength:5000},
  status:{type:String,enum:['OPEN','IN_PROGRESS','RESOLVED'],default:'OPEN',index:true},
  lastMessageAt:{type:Date,index:true},
  lastMessagePreview:{type:String,default:''},
  unreadForUser:{type:Number,default:0,min:0},
  unreadForAdmin:{type:Number,default:0,min:0}
},{...opts,indexes:[
  {userId:1,createdAt:-1},
  {status:1,lastMessageAt:-1},
  {unreadForAdmin:1,lastMessageAt:-1},
  {unreadForAdmin:1,lastMessageAt:-1,createdAt:-1}
]}));

export const SupportMessage=model('SupportMessage',new Schema({
  ticketId:{type:Schema.Types.ObjectId,ref:'SupportTicket',required:true,index:true},
  senderId:{type:Schema.Types.ObjectId,ref:'User',required:true,index:true},
  senderRole:{type:String,enum:['USER','ADMIN'],required:true,index:true},
  message:{type:String,required:true,trim:true,maxlength:5000}
},{...opts,indexes:[
  {ticketId:1,createdAt:1},
  {senderId:1,createdAt:-1}
]}));
export const AuditLog=model('AuditLog',new Schema({adminId:{type:Schema.Types.ObjectId,ref:'User',index:true},action:String,target:String,targetId:String,oldValue:Schema.Types.Mixed,newValue:Schema.Types.Mixed,ip:String},{...opts,indexes:[{createdAt:-1},{target:1,targetId:1}]}));
export const SystemSetting=model('SystemSetting',new Schema({key:{type:String,unique:true},value:Schema.Types.Mixed},{...opts}));
export {mongoose};

