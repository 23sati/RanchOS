import { createMiddleware } from 'hono/factory';
import { auth } from '@ranchos/db/src/auth';
import { db } from '@ranchos/db/src';
import { profiles, user } from '@ranchos/db/src/schema';
import { eq } from 'drizzle-orm';

type SessionUser = {
  id: string;
  email: string;
  name: string;
  image?: string | null;
};

async function getRequiredSession(headers: Headers) {
  const session = await auth.api.getSession({
    headers,
  });

  if (session?.user) {
    return session;
  }

  const authHeader = headers.get('authorization');
  const devTokenPrefix = 'Bearer dev:';

  if (process.env.NODE_ENV === 'production' || !authHeader?.startsWith(devTokenPrefix)) {
    return null;
  }

  const userId = authHeader.slice(devTokenPrefix.length).trim();
  if (!userId) {
    return null;
  }

  const devUser = await db.query.user.findFirst({
    where: eq(user.id, userId),
  });

  if (!devUser) {
    return null;
  }

  return {
    session: null,
    user: {
      id: devUser.id,
      email: devUser.email,
      name: devUser.name,
      image: devUser.image,
    },
  };
}

export const sessionMiddleware = createMiddleware<{
  Variables: {
    userId: string;
    sessionUser: SessionUser;
  }
}>(async (c, next) => {
  const session = await getRequiredSession(c.req.raw.headers);

  if (!session?.user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('userId', session.user.id);
  c.set('sessionUser', {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });

  await next();
});

export const orgScopeMiddleware = createMiddleware<{
  Variables: {
    userId: string;
    sessionUser: SessionUser;
    profileId: string;
    orgId: string;
    userRole: string;
  }
}>(async (c, next) => {
  const session = await getRequiredSession(c.req.raw.headers);

  if (!session?.user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.id, session.user.id)
  });

  if (!profile) {
    return c.json({ error: 'Onboarding required' }, 403);
  }

  c.set('userId', session.user.id);
  c.set('sessionUser', {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image,
  });
  c.set('profileId', profile.id);
  c.set('orgId', profile.orgId);
  c.set('userRole', profile.role);

  await next();
});
