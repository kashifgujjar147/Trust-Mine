import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env, allowedOrigins } from './config/env.js';
import { connectDB } from './config/db.js';
import { router } from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { startCycleJob } from './jobs/cycleJob.js';
import { initializeWallets } from './services/ledger.js';
import {paymentProofUpload} from './middleware/paymentProofUpload.js';
import mongoose from 'mongoose';
import path from 'path';
import {fileURLToPath} from 'url';

const app = express();
app.set('trust proxy', 1);

app.use(helmet());

app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));



app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.map(x => x.replace(/\/$/, '')).includes(origin.replace(/\/$/, ''))) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

app.use(
  express.json({
    limit: '1mb',
  })
);

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.NODE_ENV === 'production' ? 300 : 2000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/api', router);

app.use(notFound);

app.use(
  (err: any, _req: any, res: any, _next: any) => {
    console.error('[API ERROR]', { name: err?.name, message: err?.message, code: err?.code });

    res.status(Number(err?.statusCode) || 500).json({
      message: Number(err?.statusCode) && err?.statusCode < 500 ? String(err.message || 'Request failed') : 'Internal server error',
    });
  }
);

connectDB()
  .then(async () => {
    if (env.MONGODB_TRANSACTIONS_REQUIRED) {
      const topology =
        (mongoose.connection.getClient() as any)
          .topology?.description?.type;

      if (
        !['ReplicaSetWithPrimary', 'Sharded'].includes(topology)
      ) {
        throw new Error(
          'MONGODB_TRANSACTIONS_REQUIRED is enabled but MongoDB is not transaction-capable. Use a replica set or sharded cluster.'
        );
      }
    }

    await initializeWallets();

    startCycleJob();

    app.listen(env.PORT, () =>
      console.log(`API listening on ${env.PORT}`)
    );
  })
  .catch((e) => {
    console.error('[STARTUP ERROR]', e?.message || e);
    process.exit(1);
  });

const shutdown = async (signal:string) => {
  console.log(`${signal}: shutting down`);
  await mongoose.connection.close(false).catch(()=>undefined);
  process.exit(0);
};
process.once('SIGINT',()=>void shutdown('SIGINT'));
process.once('SIGTERM',()=>void shutdown('SIGTERM'));



