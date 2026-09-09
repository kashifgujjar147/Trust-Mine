import { Request, Response } from 'express';
import { User } from '../models/index.js';
import { hash, compare, sign } from '../utils/auth.js';
import crypto from 'node:crypto';
import {
  registerSchema,
  authSchema,
  profileSchema,
} from '../validators/index.js';

const uid = () =>
  `TM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const ref = () =>
  `REF-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

export async function register(req: Request, res: Response) {
  console.log('========== REGISTER HIT ==========');
  console.log('REGISTER BODY:', req.body);

  try {
    const parsed = registerSchema.safeParse(req.body);

    console.log('REGISTER VALIDATED:', parsed.success);

    if (!parsed.success) {
      console.error(
        'REGISTER VALIDATION ERROR:',
        parsed.error.flatten()
      );

      return res.status(400).json({
        message: 'Invalid registration data',
        errors: parsed.error.flatten(),
      });
    }

    const {
      fullName,
      username,
      email,
      phone,
      password,
      referralCode,
    } = parsed.data;

    console.log('REGISTER DATA:', {
      fullName,
      username,
      email,
      phone,
      hasPassword: Boolean(password),
      referralCode,
    });

    console.log('CHECKING EXISTING USER...');

    const exists = await User.findOne({
      $or: [
        { email: email.toLowerCase() },
        { username },
      ],
    });

    console.log('EXISTING USER:', !!exists);

    if (exists) {
      return res.status(409).json({
        message: 'Email or username already exists',
      });
    }

    let parent: any = null;

    if (referralCode) {
      console.log('CHECKING REFERRAL CODE:', referralCode);

      parent = await User.findOne({
        referralCode,
      });

      console.log('REFERRAL PARENT FOUND:', !!parent);
    }

    if (referralCode && !parent) {
      return res.status(400).json({
        message: 'Invalid referral code',
      });
    }

    console.log('HASHING PASSWORD...');

    const passwordHash = await hash(password);

    console.log('PASSWORD HASHED SUCCESSFULLY');

    const userId = uid();
    const referral = ref();

    console.log('GENERATED USER ID:', userId);
    console.log('GENERATED REFERRAL CODE:', referral);

    console.log('CREATING USER IN MONGODB...');

    const u = await User.create({
      fullName,
      username,
      email: email.toLowerCase(),
      phone,
      passwordHash,
      userId,
      referralCode: referral,
      referredBy: parent?._id,
    });

    console.log('USER CREATED SUCCESSFULLY:', u._id);

    console.log('CREATING JWT...');

    const token = sign(u.id, u.role);

    console.log('JWT CREATED SUCCESSFULLY');

    const responseUser = safe(u);

    console.log('REGISTER SUCCESS');

    return res.status(201).json({
      token,
      user: responseUser,
    });
  } catch (e: any) {
    console.error('========== REGISTER ERROR ==========');
    console.error('ERROR OBJECT:', e);
    console.error('ERROR NAME:', e?.name);
    console.error('ERROR MESSAGE:', e?.message);
    console.error('ERROR CODE:', e?.code);
    console.error('ERROR STACK:', e?.stack);
    console.error('====================================');

    return res.status(500).json({
      message: 'Registration failed',
      error: e?.message || String(e),
    });
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
      token: sign(u.id, u.role),
      user: safe(u),
    });
  } catch (e: any) {
    console.error('LOGIN ERROR:', e);

    return res.status(500).json({
      message: 'Login failed',
      error: e?.message || String(e),
    });
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
    console.error('ME ERROR:', e);

    return res.status(500).json({
      message: 'Failed to load user',
      error: e?.message || String(e),
    });
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
    console.error('UPDATE ME ERROR:', e);

    return res.status(500).json({
      message: 'Failed to update profile',
      error: e?.message || String(e),
    });
  }
}