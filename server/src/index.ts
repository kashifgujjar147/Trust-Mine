import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { router } from './routes/index.js';
import { notFound } from './middleware/notFound.js';
import { startCycleJob } from './jobs/cycleJob.js';
import { initializeWallets } from './services/ledger.js';
import mongoose from 'mongoose';

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.CLIENT_URL,
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
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.use('/api', router);

app.use(notFound);

app.use(
  (err: any, _req: any, res: any, _next: any) => {
    console.error(err);

    res.status(500).json({
      message: 'Internal server error',
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
    console.error(e);
    process.exit(1);
  });