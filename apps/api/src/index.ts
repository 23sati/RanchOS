import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { auth } from '@ranchos/db/src/auth';

import blocksRouter from './routes/blocks';
import onboardingRouter from './routes/onboarding';
import ranchesRouter from './routes/ranches';
import irrigationRouter from './routes/irrigation';
import complianceRouter from './routes/compliance';
import harvestRouter from './routes/harvest';
import scoutingRouter from './routes/scouting';
import tasksRouter from './routes/tasks';
import intelligenceRouter from './routes/intelligence';
import notificationsRouter from './routes/notifications';
import laborRouter from './routes/labor';
import syncRouter from './routes/sync';
import eventsRouter from './routes/events';
import degreeDaysRouter from './routes/degreeDays';
import frostRouter from './routes/frost';
import advisorRouter from './routes/advisor';
import agworldRouter from './routes/agworld';
import sgmaRouter from './routes/sgma';
import stripeWebhookRouter from './routes/webhooks/stripe';

import { Queue, Worker } from 'bullmq';
import { redis, isRedisOnline } from './lib/redis';
import { cimisSyncJob } from './workers/cimisSyncWorker';
import { frostCheckJob } from './workers/frostAlertWorker';
import { etAlertJob } from './workers/etAlertWorker';
import { degreeDayJob } from './workers/degreeDayWorker';
import {
  notificationDeliveryQueueName,
  notificationReceiptQueueName,
} from './lib/notificationDeliveries';
import { recommendationRefreshQueueName } from './lib/refreshRecommendations';
import { notificationDeliveryJob } from './workers/notificationDeliveryWorker';
import { notificationReceiptJob } from './workers/notificationReceiptWorker';
import { recommendationRefreshJob } from './workers/recommendationRefreshWorker';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  credentials: true,
}));

// Routes
app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Better Auth Mount
app.all('/api/auth', (c) => auth.handler(c.req.raw));
app.all('/api/auth/*', (c) => auth.handler(c.req.raw));

// Phase 1 Routes
app.route('/api/v1/onboarding', onboardingRouter);
app.route('/api/v1/blocks', blocksRouter);
app.route('/api/v1/ranches', ranchesRouter);
app.route('/api/v1/irrigation', irrigationRouter);
app.route('/api/v1/compliance', complianceRouter);
app.route('/api/v1/harvest', harvestRouter);
app.route('/api/v1/scouting', scoutingRouter);
app.route('/api/v1/tasks', tasksRouter);
app.route('/api/v1/labor', laborRouter);
app.route('/api/v1/intelligence', intelligenceRouter);
app.route('/api/v1/degree-days', degreeDaysRouter);
app.route('/api/v1/notifications', notificationsRouter);
app.route('/api/v1/frost', frostRouter);
app.route('/api/v1/advisor', advisorRouter);
app.route('/api/v1/agworld', agworldRouter);
app.route('/api/v1/sgma', sgmaRouter);
app.route('/api/v1/sync', syncRouter);
app.route('/api/v1/events', eventsRouter);
app.route('/api/webhooks/stripe', stripeWebhookRouter);

// Set up BullMQ Scheduled Jobs
async function initQueues() {
  const online = await isRedisOnline();
  if (!online) {
    console.warn('⚠️ Redis not found at localhost:6379. BullMQ workers are offline.');
    return;
  }

  try {
    const cimisSyncQueue = new Queue('cimis-sync', { connection: redis });
    await cimisSyncQueue.add('nightly', {}, { repeat: { pattern: '0 6 * * *' }, jobId: 'cimis-nightly' });
    new Worker('cimis-sync', async () => await cimisSyncJob(), { connection: redis });

    const degreeDayQueue = new Queue('degree-day', { connection: redis });
    await degreeDayQueue.add('daily', {}, { repeat: { pattern: '10 6 * * *' }, jobId: 'degree-day-daily' });
    new Worker('degree-day', async () => await degreeDayJob(), { connection: redis });

    const frostQueue = new Queue('frost-check', { connection: redis });
    await frostQueue.add('frost', {}, { repeat: { every: 30 * 60 * 1000 }, jobId: 'frost-30min' });
    new Worker('frost-check', async () => await frostCheckJob(), { connection: redis });

    const etQueue = new Queue('check-alerts', { connection: redis });
    await etQueue.add('et-hourly', {}, { repeat: { pattern: '0 * * * *' }, jobId: 'et-hourly' });
    new Worker('check-alerts', async () => await etAlertJob(), { connection: redis });

    const notificationDeliveryQueue = new Queue(notificationDeliveryQueueName, { connection: redis });
    await notificationDeliveryQueue.add(
      'deliver',
      {},
      { repeat: { every: 60 * 1000 }, jobId: 'notification-delivery-minute' },
    );
    new Worker(
      notificationDeliveryQueueName,
      async () => await notificationDeliveryJob(),
      { connection: redis, concurrency: 1 },
    );

    const notificationReceiptQueue = new Queue(notificationReceiptQueueName, { connection: redis });
    await notificationReceiptQueue.add(
      'reconcile',
      {},
      { repeat: { every: 5 * 60 * 1000 }, jobId: 'notification-receipt-five-minute' },
    );
    new Worker(
      notificationReceiptQueueName,
      async () => await notificationReceiptJob(),
      { connection: redis, concurrency: 1 },
    );

    new Worker(recommendationRefreshQueueName, async (job) => await recommendationRefreshJob(job), {
      connection: redis,
      concurrency: 2,
    });

    console.log('✅ BullMQ Queues and Workers initialized.');
  } catch (err) {
    console.warn('⚠️ BullMQ initialization failed:', err instanceof Error ? err.message : err);
  }
}

initQueues();

// Start server
const port = 3001;
console.log(`🚀 RanchOS API is running on port ${port}`);

serve({
  fetch: app.fetch,
  port,
});
