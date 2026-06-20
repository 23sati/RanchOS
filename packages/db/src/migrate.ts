import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

type JournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const journalPath = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));

const sentinelTablesByTag: Record<string, string[]> = {
  '0000_worthless_morlocks': [
    'organizations',
    'profiles',
    'ranches',
    'blocks',
    'tasks',
    'scouting_logs',
  ],
  '0001_whole_greymalkin': [
    'products',
    'application_records',
    'harvest_events',
    'crew_members',
    'labor_entries',
    'org_integrations',
  ],
  '0002_colorful_luke_cage': [
    'degree_day_records',
    'ai_recommendations',
    'agworld_sync_log',
    'api_keys',
    'handler_ticket_imports',
  ],
  '0003_loving_bastion': [
    'users',
    'sessions',
    'accounts',
    'verifications',
  ],
  '0010_spotty_songbird': [
    'weather_forecasts',
  ],
  '0011_tan_swarm': [
    'notifications',
  ],
  '0013_calm_harrier': [
    'notification_settings',
    'notification_deliveries',
  ],
  '0016_tan_talos': [
    'inventory_items',
    'inventory_locations',
    'inventory_stocks',
    'inventory_movements',
  ],
  '0017_fast_luminals': [
    'product_inventory_links',
  ],
};

function readJournal(): JournalEntry[] {
  const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
    entries: JournalEntry[];
  };

  return journal.entries;
}

function readMigrationSql(tag: string) {
  return fs.readFileSync(`${migrationsFolder}/${tag}.sql`, 'utf8');
}

function hashMigration(sqlText: string) {
  return crypto.createHash('sha256').update(sqlText).digest('hex');
}

function loadEnvFile() {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) {
      continue;
    }

    const rawValue = trimmed.slice(separatorIndex + 1).split('#', 1)[0].trim();
    process.env[key] = rawValue;
  }
}

async function ensureMigrationsTable(client: Client) {
  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await client.query(`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `);
}

async function getAppliedMigrationTimes(client: Client) {
  const { rows } = await client.query<{ created_at: string }>(
    'SELECT created_at FROM drizzle.__drizzle_migrations',
  );

  return new Set(rows.map((row) => Number(row.created_at)));
}

async function tableExists(client: Client, tableName: string) {
  const { rows } = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS "exists"
    `,
    [tableName],
  );

  return rows[0]?.exists ?? false;
}

async function reconcileExistingMigrations(client: Client, entries: JournalEntry[]) {
  const appliedTimes = await getAppliedMigrationTimes(client);

  for (const entry of entries) {
    if (appliedTimes.has(entry.when)) {
      continue;
    }

    const sentinels = sentinelTablesByTag[entry.tag];
    if (!sentinels?.length) {
      continue;
    }

    let allTablesExist = true;
    for (const tableName of sentinels) {
      if (!(await tableExists(client, tableName))) {
        allTablesExist = false;
        break;
      }
    }

    if (!allTablesExist) {
      continue;
    }

    const sqlText = readMigrationSql(entry.tag);
    await client.query(
      'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
      [hashMigration(sqlText), entry.when],
    );

    appliedTimes.add(entry.when);
    console.log(`Reconciled existing migration ${entry.tag}`);
  }
}

async function applyPendingMigrations(client: Client, entries: JournalEntry[]) {
  const appliedTimes = await getAppliedMigrationTimes(client);

  for (const entry of entries) {
    if (appliedTimes.has(entry.when)) {
      continue;
    }

    const sqlText = readMigrationSql(entry.tag);
    const statements = sqlText
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean);

    console.log(`Applying ${entry.tag}...`);
    for (const statement of statements) {
      await client.query(statement);
    }

    await client.query(
      'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
      [hashMigration(sqlText), entry.when],
    );

    console.log(`Applied ${entry.tag}`);
  }
}

async function main() {
  loadEnvFile();

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  try {
    const entries = readJournal();
    await ensureMigrationsTable(client);
    await reconcileExistingMigrations(client, entries);
    await applyPendingMigrations(client, entries);
    console.log('Database migrations are up to date.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
