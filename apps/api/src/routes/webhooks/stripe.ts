import { Hono } from 'hono';
import Stripe from 'stripe';
import { db } from '@ranchos/db/src';
import { subscriptions } from '@ranchos/db/src/schema';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'dummy_key_to_prevent_crash_in_dev', {
  apiVersion: '2023-10-16' as any,
});

const app = new Hono();

app.post('/', async (c) => {
  const sig = c.req.header('stripe-signature');
  const bodyText = await c.req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      bodyText,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    return c.json({ error: `Webhook Error: ${err.message}` }, 400);
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const currentPeriodEnd = new Date((subscription as any).current_period_end * 1000);
        
        await db.update(subscriptions)
          .set({
            status: subscription.status === 'active' ? 'active' : 'past_due',
            currentPeriodEnd,
            updatedAt: new Date()
          })
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await db.update(subscriptions)
          .set({ status: 'canceled', updatedAt: new Date() })
          .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;
        if (invoice.subscription) {
          await db.update(subscriptions)
            .set({ status: 'past_due', updatedAt: new Date() })
            .where(eq(subscriptions.stripeSubscriptionId, invoice.subscription as string));
        }
        break;
      }
    }
  } catch (err: any) {
     console.error('Error handling stripe webhook', err);
     return c.json({ error: 'Database update failed' }, 500);
  }

  return c.json({ received: true });
});

export default app;
