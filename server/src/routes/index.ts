import {Router,RequestHandler} from 'express';
import {env} from '../config/env.js';
import rateLimit from 'express-rate-limit';
import {register,login,me,updateMe,requestPasswordReset,resetPassword} from '../controllers/auth.js';import * as c from '../controllers/core.js';import {auth,admin} from '../middleware/auth.js';import {maintenanceGuard} from '../middleware/maintenance.js';import {validate} from '../middleware/validate.js';import {depositSchema,withdrawalSchema,supportSchema,supportMessageSchema,supportStatusSchema} from '../validators/index.js';import {PackagePurchase} from '../models/index.js';import {telegramLinkCode,telegramUnlink,telegramWebhook} from '../controllers/telegram.js';
import {paymentProofUpload} from '../middleware/paymentProofUpload.js';
export const router=Router();
const authSensitiveLimit=rateLimit({windowMs:15*60*1000,max:env.NODE_ENV === 'production' ? 10 : 100,standardHeaders:true,legacyHeaders:false,message:{message:'Too many authentication requests. Please try again later.'}});
const wrap=(handler:RequestHandler):RequestHandler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);
const route={get:(path:string,...handlers:RequestHandler[])=>router.get(path,...handlers.map(wrap)),post:(path:string,...handlers:RequestHandler[])=>router.post(path,...handlers.map(wrap)),patch:(path:string,...handlers:RequestHandler[])=>router.patch(path,...handlers.map(wrap)),delete:(path:string,...handlers:RequestHandler[])=>router.delete(path,...handlers.map(wrap))};
const userAuth=[auth,maintenanceGuard] as RequestHandler[];
const adminAuth=[auth,maintenanceGuard,admin] as RequestHandler[];
route.get('/health',(_r,s)=>s.json({ok:true,service:'trust-mine-api'}));route.post('/telegram/webhook',telegramWebhook);route.post('/telegram/link-code',...userAuth,telegramLinkCode);route.post('/telegram/unlink',...userAuth,telegramUnlink);
route.post('/auth/register',authSensitiveLimit,register);route.post('/auth/login',authSensitiveLimit,login);route.post('/auth/forgot-password',authSensitiveLimit,requestPasswordReset);route.post('/auth/reset-password',authSensitiveLimit,resetPassword);route.get('/auth/me',...userAuth,me);route.patch('/users/me',...userAuth,updateMe);
route.get('/packages',...userAuth,c.packages);route.get('/packages/:id',...userAuth,c.packageById);route.get('/payment-methods',...userAuth,c.methods);route.get('/users/dashboard',...userAuth,c.dashboard);route.get('/settings',...userAuth,c.settings);
route.post(
  '/deposits/payment-proof',
  ...userAuth,
  paymentProofUpload.single('proof'),
  (req:any,res:any)=>{
    if(!req.file){
      return res.status(400).json({
        message:'Payment screenshot is required.'
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    return res.status(201).json({
      message:'Payment screenshot uploaded successfully.',
      proofUrl:`${baseUrl}/uploads/payment-proofs/${req.file.filename}`
    });
  }
);
route.post('/deposits',...userAuth,validate(depositSchema),c.createDeposit);route.get('/deposits',...userAuth,c.deposits);route.get('/deposits/:id',...userAuth,c.depositDetails);
route.post('/withdrawals',...userAuth,validate(withdrawalSchema),c.createWithdrawal);route.get('/withdrawals',...userAuth,c.withdrawals);route.get('/withdrawals/:id',...userAuth,c.withdrawalDetails);
route.get('/transactions',...userAuth,c.transactions);route.get('/team',...userAuth,c.team);route.get('/rewards',...userAuth,c.rewards);route.post('/rewards/:id/claim',...userAuth,c.claimRewardRoute);route.get('/promo',...userAuth,c.promos);route.post('/promo/validate',...userAuth,c.promoValidate);route.post('/promo/apply',...userAuth,c.promoApply);route.get('/notifications',...userAuth,c.notifications);route.patch('/notifications/:id/read',...userAuth,c.markNotification);route.get('/support',...userAuth,c.tickets);route.post('/support',...userAuth,validate(supportSchema),c.createTicket);route.get('/support/:id/messages',...userAuth,c.supportMessages);route.post('/support/:id/messages',...userAuth,validate(supportMessageSchema),c.supportSendMessage);route.post('/support/:id/read',...userAuth,c.supportMarkRead);route.get('/package-purchases',...userAuth,async(req:any,res:any)=>res.json({purchases:await PackagePurchase.find({userId:req.user.id}).populate('packageId').sort({createdAt:-1})}));
route.get('/admin/dashboard',...adminAuth,c.adminDashboard);route.get('/admin/users',...adminAuth,c.adminUsers);route.patch('/admin/users/:id/password',...adminAuth,c.adminChangeUserPassword);route.post('/admin/users/:id/login-as',...adminAuth,c.adminLoginAsUser);route.patch('/admin/users/:id/status',...adminAuth,c.adminUpdateUserStatus);route.get('/admin/packages',...adminAuth,c.adminPackages);route.post('/admin/packages',...adminAuth,c.createPackage);route.patch('/admin/packages/:id',...adminAuth,c.updatePackage);route.delete('/admin/packages/:id',...adminAuth,c.archivePackage);route.get('/admin/deposits',...adminAuth,c.adminDeposits);route.post('/admin/deposits/:id/verify',...adminAuth,c.verifyDeposit);route.post('/admin/deposits/:id/reject',...adminAuth,c.adminDepositReject);route.get('/admin/withdrawals',...adminAuth,c.adminWithdrawals);route.post('/admin/withdrawals/:id/approve',...adminAuth,c.adminWithdrawalApprove);route.post('/admin/withdrawals/:id/reject',...adminAuth,c.adminWithdrawalReject);route.post('/admin/withdrawals/:id/processing',...adminAuth,c.adminWithdrawalProcessing);route.post('/admin/withdrawals/:id/complete',...adminAuth,c.adminWithdrawalComplete);
route.get('/admin/transactions',...adminAuth,c.adminTransactions);route.get('/admin/payment-methods',...adminAuth,c.adminPaymentMethods);route.post('/admin/payment-methods',...adminAuth,c.crudPayment);route.patch('/admin/payment-methods/:id',...adminAuth,c.crudPayment);route.get('/admin/promo',...adminAuth,c.adminPromos);route.post('/admin/promo',...adminAuth,c.crudPromo);route.patch('/admin/promo/:id',...adminAuth,c.crudPromo);route.get('/admin/rewards',...adminAuth,c.adminRewards);route.post('/admin/rewards',...adminAuth,c.crudReward);route.patch('/admin/rewards/:id',...adminAuth,c.crudReward);route.get('/admin/settings',...adminAuth,c.adminSettings);route.patch('/admin/settings',...adminAuth,c.updateSettings);route.get('/admin/audit-logs',...adminAuth,c.adminAuditLogs);route.get('/admin/notifications',...adminAuth,c.adminNotifications);route.get('/admin/support',...adminAuth,c.adminTickets);route.get('/admin/support/:id/messages',...adminAuth,c.adminSupportMessages);route.post('/admin/support/:id/messages',...adminAuth,validate(supportMessageSchema),c.adminSupportSendMessage);route.post('/admin/support/:id/read',...adminAuth,c.adminSupportMarkRead);route.patch('/admin/support/:id/status',...adminAuth,validate(supportStatusSchema),c.adminSupportStatus);







