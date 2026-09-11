import { Request, Response } from 'express';
import { User, PasswordResetToken } from '../models/index.js';
import { hash, compare, sign } from '../utils/auth.js';
import crypto from 'node:crypto';
import {
  registerSchema,
  authSchema,
  profileSchema,
} from '../validators/index.js';
import { env } from '../config/env.js';

const uid = () =>
  `TM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const ref = () =>
  `REF-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

export async function register(req: Request, res: Response) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({message:'Invalid registration data', errors: parsed.error.flatten()});
    const {fullName,username,email,phone,password,referralCode}=parsed.data;
    const normalizedEmail=email.toLowerCase();
    const exists=await User.findOne({$or:[{email:normalizedEmail},{username}]});
    if(exists) return res.status(409).json({message:'Email or username already exists'});
    let parent:any=null;
    if(referralCode){
      parent=await User.findOne({referralCode});
      if(!parent) return res.status(400).json({message:'Invalid referral code'});
    }
    const passwordHash=await hash(password);
    const u=await User.create({fullName,username,email:normalizedEmail,phone,passwordHash,userId:uid(),referralCode:ref(),referredBy:parent?._id});
    return res.status(201).json({token:sign(u.id,u.role),user:safe(u)});
  } catch (e:any) {
    if(e?.code===11000) return res.status(409).json({message:'Email, username, or referral code already exists'});
    console.error('[REGISTER ERROR]', {name:e?.name,message:e?.message,code:e?.code});
    return res.status(500).json({message:'Registration failed'});
  }
}

export async function login(req: Request, res: Response) {
  try {
    const parsed = authSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid login data',
      });
    }

    const u = await User.findOne({
      email: parsed.data.email.toLowerCase(),
    });

    if (
      !u ||
      !(await compare(
        parsed.data.password,
        u.passwordHash
      ))
    ) {
      return res.status(401).json({
        message: 'Invalid credentials',
      });
    }

    if (u.status !== 'ACTIVE') {
      return res.status(403).json({
        message: 'Account disabled',
      });
    }

    return res.json({
      token: sign(u.id, u.role, Number(u.tokenVersion || 0)),
      user: safe(u),
    });
  } catch (e: any) {
    console.error('[LOGIN ERROR]', {name:e?.name,message:e?.message,code:e?.code});
    return res.status(500).json({message: 'Login failed'});
  }
}

export async function me(req: any, res: Response) {
  try {
    const u = await User.findById(req.user.id);

    if (!u) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    return res.json({
      user: safe(u),
    });
  } catch (e: any) {
    console.error('[ME ERROR]', {name:e?.name,message:e?.message,code:e?.code});
    return res.status(500).json({message: 'Failed to load user'});
  }
}

export async function requestPasswordReset(req: Request, res: Response) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const generic = {message:'If the account exists, password-reset instructions will be sent.'};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({message:'Enter a valid email address'});
  try {
    const user = await User.findOne({email});
    if (!user) return res.json(generic);
    await PasswordResetToken.deleteMany({userId:user._id, expiresAt:{$lte:new Date()}});
    const raw = crypto.randomBytes(32).toString('hex');
    if (!env.PASSWORD_RESET_WEBHOOK_URL && env.NODE_ENV === 'production') {
      console.error('[PASSWORD RESET] delivery provider is not configured');
      return res.json(generic);
    }
    const tokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    const expiresAt = new Date(Date.now()+env.PASSWORD_RESET_TOKEN_TTL_MINUTES*60*1000);
    await PasswordResetToken.create({userId:user._id,tokenHash,expiresAt});
    const resetUrl=`${env.CLIENT_URL}/reset-password?token=${raw}`;
    if (!env.PASSWORD_RESET_WEBHOOK_URL) return res.json({...generic, resetUrl});
    const response=await fetch(env.PASSWORD_RESET_WEBHOOK_URL,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({event:'password_reset',email,fullName:user.fullName,resetUrl,expiresAt:expiresAt.toISOString()})});
    if(!response.ok) {
      console.error('[PASSWORD RESET] delivery provider returned non-2xx', response.status);
      return res.json(generic);
    }
    return res.json(generic);
  } catch (e:any) {
    console.error('[PASSWORD RESET REQUEST ERROR]', {name:e?.name,message:e?.message,code:e?.code});
    return res.status(500).json({message:'Unable to process password reset request'});
  }
}

export async function resetPassword(req: Request, res: Response) {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');
  if (!/^[a-f0-9]{64}$/i.test(token) || password.length < 8 || password.length > 128) return res.status(400).json({message:'Invalid reset request'});
  try {
    const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
    const record=await PasswordResetToken.findOneAndUpdate({tokenHash,usedAt:{$exists:false},expiresAt:{$gt:new Date()}},{$set:{usedAt:new Date()}},{new:true});
    if(!record) return res.status(400).json({message:'Reset token is invalid or expired'});
    const passwordHash=await hash(password);
    const updated=await User.findOneAndUpdate({_id:record.userId,status:'ACTIVE'},{$set:{passwordHash},$inc:{tokenVersion:1}},{new:true});
    if(!updated) return res.status(400).json({message:'Unable to reset password'});
    await PasswordResetToken.deleteMany({userId:record.userId,_id:{$ne:record._id}});
    return res.json({message:'Password updated successfully'});
  } catch (e:any) {
    console.error('[PASSWORD RESET ERROR]', {name:e?.name,message:e?.message,code:e?.code});
    return res.status(500).json({message:'Password reset failed'});
  }
}

function safe(u: any) {
  return {
    _id: u._id,
    userId: u.userId,
    fullName: u.fullName,
    username: u.username,
    email: u.email,
    phone: u.phone,
    referralCode: u.referralCode,
    role: u.role,
    status: u.status,
  };
}

export async function updateMe(
  req: any,
  res: Response
) {
  try {
    const parsed = profileSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: 'Invalid profile data',
        errors: parsed.error.flatten(),
      });
    }

    const u = await User.findByIdAndUpdate(
      req.user.id,
      {
        $set: parsed.data,
      },
      {
        new: true,
        runValidators: true,
      }
    ).select('-passwordHash');

    if (!u) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    return res.json({
      user: safe(u),
    });
  } catch (e: any) {
    console.error('[UPDATE ME ERROR]', {name:e?.name,message:e?.message,code:e?.code});
    return res.status(500).json({message: 'Failed to update profile'});
  }
}