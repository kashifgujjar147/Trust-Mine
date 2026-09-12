import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import type { SignOptions } from 'jsonwebtoken';

export async function hash(p: string) {
  return bcrypt.hash(p, 12);
}

export async function compare(p: string, h: string) {
  return bcrypt.compare(p, h);
}

export function sign(
  id: string,
  role: string,
  tokenVersion = 0,
  options?: {
    impersonatedBy?: string;
    expiresIn?: SignOptions['expiresIn'];
  }
) {
  const payload = {
    id,
    role,
    tokenVersion,
    ...(options?.impersonatedBy
      ? { impersonatedBy: options.impersonatedBy }
      : {})
  };

  return jwt.sign(
    payload,
    env.JWT_SECRET,
    {
      expiresIn: options?.expiresIn || '7d'
    }
  );
}

export function verify(t: string) {
  return jwt.verify(t, env.JWT_SECRET) as {
    id: string;
    role: string;
    tokenVersion?: number;
    impersonatedBy?: string;
  };
}
