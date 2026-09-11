export type Role='USER'|'ADMIN';
export type Status='PENDING'|'PROCESSING'|'COMPLETED'|'REJECTED'|'FAILED'|'ACTIVE'|'APPROVED'|'PAID'|'EXPIRED'|'CANCELLED';
export type TransactionType='DEPOSIT'|'PACKAGE_PURCHASE'|'PACKAGE_INCOME'|'WITHDRAWAL'|'WITHDRAWAL_FEE'|'COMMISSION'|'REWARD'|'PROMO_REWARD'|'ADJUSTMENT'|'REFUND'|'REVERSAL';
export interface Admin extends User{}
export interface Referral{_id:string;userId:string;name:string;level:number;status:string;joinedAt:string;}
export interface Commission{_id:string;userId:string;sourceUserId:string;level:number;rate:number;amount:number;transactionId:string;}
export interface AuditLog{_id:string;adminId:string;action:string;target:string;targetId:string;oldValue?:unknown;newValue?:unknown;createdAt:string;}
export interface User{_id:string;userId:string;fullName:string;username:string;email:string;phone?:string;referralCode:string;referredBy?:string;role:Role;status:string;createdAt:string;}
export interface PackagePlan{_id:string;name:string;amount:number;cycleDays:number;incomeConfiguration:{daily:number;total?:number};description:string;image?:string;status:string;isActive?:boolean;sortOrder:number;createdAt?:string;updatedAt?:string;}
export interface PackagePurchase{_id:string;packageId:string;packageName:string;packageAmount:number;status:Status;activatedAt:string;cycleStart:string;cycleEnd:string;cycleDaysSnapshot?:number;currentCycle:number;accruedAmount:number;nextProcessAt:string;}
export interface Deposit{_id:string;transactionId:string;amount:number;status:Status;method:string;packageId?:string;packageName?:string;reference?:string;proofUrl?:string;createdAt:string;}
export interface Withdrawal{_id:string;transactionId:string;amount:number;fee:number;netAmount:number;method:string;account:string;accountHolderName:string;status:Status;createdAt:string;reservedAmount?:number;idempotencyKey?:string;}
export interface Transaction{_id:string;transactionId:string;type:TransactionType;amount:number;fee:number;netAmount:number;status:Status;reference?:string;description?:string;createdAt:string;}
export interface TeamMember{_id:string;userId:string;name:string;level:number;status:string;joinedAt:string;volume:number;commission:number;}
export interface RewardTier{_id:string;threshold:number;reward:number;status:string;sortOrder:number;}
export interface PromoCode{_id:string;code:string;rewardType:string;rewardValue:number;usageLimit?:number;perUserLimit?:number;minRequirement?:number;expiresAt?:string;status:string;}
export interface PaymentMethod{_id:string;code:string;name:string;status:string;instructions:string;accountDetails?:string;minAmount:number;displayOrder:number;verificationMode:'MANUAL'|'AUTOMATIC';}
export interface Notification{_id:string;title:string;message:string;read:boolean;createdAt:string;type:string;}
export interface SupportTicket{
  _id:string;
  subject:string;
  message:string;
  status:'OPEN'|'IN_PROGRESS'|'RESOLVED';
  createdAt:string;
  lastMessageAt?:string;
  lastMessagePreview?:string;
  unreadForUser?:number;
  unreadForAdmin?:number;
  user?:{
    _id:string;
    fullName?:string;
    email?:string;
    userId?:string;
  };
}
export interface SupportMessage{
  _id:string;
  ticketId:string;
  senderId:string;
  senderRole:'USER'|'ADMIN';
  message:string;
  createdAt:string;
}
export interface DashboardData{balance:number;totalBalance?:number;availableBalance:number;lockedWithdrawalAmount?:number;totalDeposit:number;income:number;totalWithdrawals:number;activePackages:number;todayIncome:number;pendingWithdrawal:number;team:number;commission:number;rewards:number;activePackagePurchases:PackagePurchase[];transactions:Transaction[];}
export interface NotificationSettings{email:boolean;inApp:boolean}
export interface PlatformSettings{currency:string;minimumDeposit:number;minimumWithdrawal:number;withdrawalFeePercent:number;commissionRates:number[];rewardTiers:RewardTier[];maintenanceMode:boolean;supportEmail:string;supportPhone:string;paymentMethods?:PaymentMethod[];notificationSettings?:NotificationSettings;cycleIntervalHours?:number;packageDurationDays?:number;}
export interface AdminDashboardData{users:number;activeUsers:number;deposits:number;pendingDeposits:number;completedDeposits:number;withdrawals:number;pendingWithdrawals:number;packagePurchases:number;activePackages:number;incomeDistributed:number;commissionDistributed:number;rewardsDistributed:number;}

