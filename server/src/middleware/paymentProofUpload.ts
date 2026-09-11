import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';

const uploadDir = path.resolve(process.cwd(), 'uploads', 'payment-proofs');

fs.mkdirSync(uploadDir, { recursive: true });

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },

  filename: (_req, file, cb) => {
    const ext =
      file.mimetype === 'image/png'
        ? '.png'
        : file.mimetype === 'image/webp'
          ? '.webp'
          : '.jpg';

    const randomName =
      `${Date.now()}-${crypto.randomBytes(16).toString('hex')}${ext}`;

    cb(null, randomName);
  }
});

export const paymentProofUpload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1
  },

  fileFilter: (_req, file, cb) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(
        new Error('Only JPG, PNG and WEBP payment screenshots are allowed.')
      );
    }

    cb(null, true);
  }
});
