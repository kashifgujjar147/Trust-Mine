import {
  Request,
  Response,
  NextFunction
} from 'express';

import { verify } from '../utils/auth.js';
import { User } from '../models/index.js';

type AuthUser = {
  id: string;
  role: string;
  tokenVersion: number;
  impersonatedBy?: string;
};

type AuthCacheEntry = {
  user: AuthUser;
  expiresAt: number;
};

const AUTH_CACHE_MS = 2000;
const authCache = new Map<string, AuthCacheEntry>();

function getCachedUser(id: string) {
  const entry = authCache.get(id);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    authCache.delete(id);
    return null;
  }
  return entry.user;
}

export function invalidateAuthUserCache(id: string) {
  authCache.delete(String(id));
}

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    role: string;
    tokenVersion: number;
    impersonatedBy?: string;
  };
}

export async function auth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const h = req.headers.authorization;

  if (!h?.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Authentication required'
    });
  }

  try {
    const token = verify(h.slice(7));

    let cached = getCachedUser(String(token.id));

    if (!cached) {
      const u = await User
        .findById(token.id)
        .select('_id role status tokenVersion')
        .lean();

      if (!u || u.status !== 'ACTIVE') {
        return res.status(401).json({
          message: 'Invalid or expired token'
        });
      }

      cached = {
        id: String(u._id),
        role: u.role,
        tokenVersion: Number(u.tokenVersion || 0)
      };
      authCache.set(String(token.id), {
        user: cached,
        expiresAt: Date.now() + AUTH_CACHE_MS
      });
    }

    if (!cached) {
      return res.status(401).json({
        message: 'Invalid or expired token'
      });
    }

    if (
      Number(token.tokenVersion || 0) !==
      Number(cached.tokenVersion || 0)
    ) {
      return res.status(401).json({
        message: 'Session expired. Please sign in again.'
      });
    }

    if (token.role !== cached.role) {
      return res.status(401).json({
        message: 'Session expired. Please sign in again.'
      });
    }

    req.user = {
      id: cached.id,
      role: cached.role,
      tokenVersion: cached.tokenVersion,
      ...(token.impersonatedBy
        ? {
            impersonatedBy:
              String(token.impersonatedBy)
          }
        : {})
    };

    next();
  } catch {
    return res.status(401).json({
      message: 'Invalid or expired token'
    });
  }
}

export function admin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({
      message: 'Admin access required'
    });
  }

  next();
}
