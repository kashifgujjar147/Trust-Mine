import {z} from 'zod';
export const registerSchema=z.object({fullName:z.string().trim().min(2).max(100),username:z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_]+$/),email:z.string().email(),phone:z.string().optional(),password:z.string().min(8).max(128),referralCode:z.string().trim().optional()});
export const authSchema=z.object({email:z.string().email(),password:z.string().min(8).max(128)});
export const depositSchema=z.object({packageId:z.string().min(1),method:z.string().min(1),amount:z.coerce.number().positive(),reference:z.string().trim().min(2).max(200),proofUrl:z.string().url().optional()});
export const profileSchema=z.object({fullName:z.string().trim().min(2).max(100).optional(),phone:z.string().trim().max(40).optional()});
export const supportSchema=z.object({subject:z.string().trim().min(2).max(150),message:z.string().trim().min(5).max(5000)});
export const withdrawalSchema=z.object({amount:z.coerce.number().positive(),method:z.string().trim().min(1).max(50),account:z.string().trim().min(2).max(200),accountHolderName:z.string().trim().min(2).max(120)});
