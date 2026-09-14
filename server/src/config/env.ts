import 'dotenv/config';
import {z} from 'zod';

const csv = z.string().default('');

export const env=z.object({
  NODE_ENV:z.enum(['development','test','production']).default('development'),
  PORT:z.coerce.number().int().positive().default(5000),
  MONGODB_URI:z.string().min(1).default('mongodb://127.0.0.1:27017/trust-mine'),
  JWT_SECRET:z.string().min(16).default('dev-only-change-me-1234567890'),
  CLIENT_URL:z.string().url().default('http://localhost:5173'),
  ALLOWED_ORIGINS:csv,
  PAYMENT_MODE:z.string().default('manual'),
  MONGODB_TRANSACTIONS_REQUIRED:z.coerce.boolean().default(false),
  WITHDRAWAL_TIMEZONE:z.string().default('Asia/Karachi'),
  WHATSAPP_CHANNEL_URL:z.string().url().optional(),
  TELEGRAM_BOT_TOKEN:z.string().optional(),
  TELEGRAM_BOT_WEBHOOK_SECRET:z.string().optional(),
  PASSWORD_RESET_WEBHOOK_URL:z.string().url().optional(),
  SMTP_HOST:z.string().optional(),
  SMTP_PORT:z.coerce.number().int().positive().default(587),
  SMTP_SECURE:z.coerce.boolean().default(false),
  SMTP_USER:z.string().optional(),
  SMTP_PASS:z.string().optional(),
  SMTP_FROM:z.string().optional(),
  PASSWORD_RESET_TOKEN_TTL_MINUTES:z.coerce.number().int().positive().max(120).default(30)
}).superRefine((v,ctx)=>{
  if(v.NODE_ENV==='production'&&v.JWT_SECRET==='dev-only-change-me-1234567890')ctx.addIssue({code:z.ZodIssueCode.custom,path:['JWT_SECRET'],message:'JWT_SECRET must be changed in production'});
  if(v.NODE_ENV==='production'&&!v.MONGODB_TRANSACTIONS_REQUIRED)ctx.addIssue({code:z.ZodIssueCode.custom,path:['MONGODB_TRANSACTIONS_REQUIRED'],message:'MONGODB_TRANSACTIONS_REQUIRED must be true in production'});
}).parse(process.env);

export const allowedOrigins = Array.from(new Set([env.CLIENT_URL,...env.ALLOWED_ORIGINS.split(',').map(x=>x.trim()).filter(Boolean)]));

