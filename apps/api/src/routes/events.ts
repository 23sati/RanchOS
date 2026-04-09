import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { orgScopeMiddleware } from '../middleware/auth';
import { redis } from '../lib/redis';

const app = new Hono<{ Variables: { orgId: string } }>();

app.get('/:orgId', orgScopeMiddleware, async (c) => {
  const paramOrgId = c.req.param('orgId');
  const orgId = c.get('orgId');
  
  if (paramOrgId !== orgId) {
     return c.json({ error: 'Unauthorized org' }, 403);
  }

  return streamSSE(c, async (stream) => {
    const subscriber = redis.duplicate();
    subscriber.on('error', () => { /* ignore offline redis in dev */ });
    await subscriber.subscribe(`org:${orgId}`);
    
    subscriber.on('message', async (channel: string, message: string) => {
      if (channel === `org:${orgId}`) {
        await stream.writeSSE({
          data: message,
        });
      }
    });

    c.req.raw.signal.addEventListener('abort', () => {
      subscriber.quit();
    });
    
    // keep stream alive
    while (!c.req.raw.signal.aborted) {
      await stream.sleep(15000);
      await stream.writeSSE({ data: 'ping', event: 'ping' });
    }
  });
});

export default app;
