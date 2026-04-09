import { db, organizations, profiles } from './index';

async function main() {
  console.log('🌱 Seeding database...');

  const [org] = await db.insert(organizations).values({
    name: 'Red Bluff Orchard',
    slug: 'red-bluff-orchard',
    primaryCrop: 'almond',
    locale: 'en',
    timezone: 'America/Los_Angeles',
  }).returning();

  await db.insert(profiles).values({
    id: '00000000-0000-0000-0000-000000000000', // Placeholder for initial admin
    orgId: org.id,
    fullName: 'Ranch Admin',
    role: 'owner',
    preferredLocale: 'en',
  });

  console.log('✅ Seed completed');
}

main().catch(console.error);
