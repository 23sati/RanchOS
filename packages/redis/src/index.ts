import Redis, { type RedisOptions } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const options: RedisOptions = {
    maxRetriesPerRequest: null, // Essential for BullMQ
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy: (times) => {
        // Stop retrying quickly to avoid spam when Redis isn't there (common in dev/test)
        if (times > 5) {
            return null;
        }
        return Math.min(times * 1000, 10000); // Wait up to 10s between retries
    },
};

/**
 * Shared Redis client instance.
 * Using a singleton pattern to ensure limited connections.
 */
export const redis = new Redis(redisUrl, options);

// Globally silence common 'ECONNREFUSED' errors to keep the console clean in dev
redis.on('error', (err) => {
    if (err.message.includes('ECONNREFUSED')) {
        // Silent
        return;
    }
    console.warn('⚠️ [Redis Shared] error:', err.message);
});

/**
 * Robustly checks if Redis is available without crashing.
 * Useful before initializing queues.
 */
export async function isRedisOnline(): Promise<boolean> {
    try {
        if (redis.status === 'ready') return true;
        if (redis.status === 'connecting' || redis.status === 'reconnecting') {
             // Wait briefly for status change
             await new Promise(r => setTimeout(r, 1000));
             return redis.status === 'ready';
        }
        
        await redis.connect().catch(() => {});
        return redis.status === 'ready';
    } catch {
        return false;
    }
}

export default redis;
