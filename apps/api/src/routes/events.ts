import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { orgScopeMiddleware } from '../middleware/auth';
import { isRedisOnline, redis } from '../lib/redis';

const app = new Hono<{ Variables: { orgId: string } }>();

app.get('/:orgId', orgScopeMiddleware, async (c) => {
  const paramOrgId = c.req.param('orgId');
  const orgId = c.get('orgId');
  
  if (paramOrgId !== orgId) {
     return c.json({ error: 'Unauthorized org' }, 403);
  }

  if (!(await isRedisOnline())) {
    return c.json({ error: 'Org event stream unavailable.' }, 503);
  }

  return streamSSE(c, async (stream) => {
    const subscriber = redis.duplicate();

    const handleSubscriberError = () => {
      void subscriber.quit().catch(() => {});
    };
    const handleMessage = async (channel: string, message: string) => {
      if (channel === `org:${orgId}`) {
        await stream.writeSSE({
          data: message,
        });
      }
    };

    subscriber.on('error', handleSubscriberError);

    try {
      await subscriber.subscribe(`org:${orgId}`);
    } catch {
      await subscriber.quit().catch(() => {});
      throw new Error('Unable to subscribe to org event stream.');
    }

    subscriber.on('message', handleMessage);

    c.req.raw.signal.addEventListener('abort', () => {
      subscriber.off('error', handleSubscriberError);
      subscriber.off('message', handleMessage);
      void subscriber.quit().catch(() => {});
    });
    
    // keep stream alive
    while (!c.req.raw.signal.aborted) {
      await stream.sleep(15000);
      await stream.writeSSE({ data: 'ping', event: 'ping' });
    }
  });
});

export default app;
