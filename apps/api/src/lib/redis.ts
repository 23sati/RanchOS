import Redis, { type RedisOptions } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const options: RedisOptions = {
  maxRetriesPerRequest: null, // BullMQ recommendation
  enableOfflineQueue: false,
  lazyConnect: true,
  retryStrategy: (times) => {
    // If Redis is missing, we don't want to spam the console.
    // Try 3 times quickly, then back off significantly.
    if (times > 5) {
      return null; // Stop retrying after 5 attempts to avoid spam
    }
    return Math.min(times * 1000, 5000);
  },
};

export const redis = new Redis(redisUrl, options);

redis.on('error', (err) => {
  if (err.message.includes('ECONNREFUSED')) {
    return;
  }

  console.warn('[Redis] error:', err.message);
});

export async function isRedisOnline(): Promise<boolean> {
  try {
    const status = redis.status;

    if (status === 'ready') {
      return true;
    }

    if (status === 'connecting' || status === 'reconnecting') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return (redis.status as string) === 'ready';
    }

    await redis.connect().catch(() => {});
    return (redis.status as string) === 'ready';
  } catch {
    return false;
  }
}

export default redis;
