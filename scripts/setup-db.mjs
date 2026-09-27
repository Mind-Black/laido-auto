import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Helper to load .env.local without external dotenv dependency
function loadEnvLocal() {
  const envPath = path.join(rootDir, '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvLocal();

const connectionString = process.env.DATABASE_URL;
const adminEmail = process.env.ADMIN_EMAIL;

if (!connectionString) {
  console.error('ERROR: DATABASE_URL is not set.');
  console.error('Please add DATABASE_URL="postgresql://..." to your .env.local file.');
  process.exit(1);
}

const { Client } = pg;
const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    console.log('Connecting to Supabase PostgreSQL database...');
    await client.connect();
    console.log('Connected successfully!');

    // Apply every migration in filename order so fresh databases receive
    // policy fixes and grants as well as the initial schema.
    const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
    const migrations = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
    for (const name of migrations) {
      console.log(`Applying ${name}...`);
      await client.query(fs.readFileSync(path.join(migrationsDir, name), 'utf8'));
    }
    console.log('All migrations applied successfully.');

    // 2. Run Seed (Building, Policy, Chargers)
    const seedPath = path.join(rootDir, 'supabase', 'seed.sql');
    if (fs.existsSync(seedPath)) {
      console.log('Seeding initial data (Building 1, Policy, Charger 1, Charger 2)...');
      const seedSql = fs.readFileSync(seedPath, 'utf8');
      await client.query(seedSql);
      console.log('Seed applied successfully.');
    }

    // 3. Invite Admin Email if provided
    if (adminEmail) {
      console.log(`Setting up admin invitation for: ${adminEmail}...`);
      await client.query(
        `INSERT INTO public.member_invitations (email, building_id, intended_role)
         VALUES ($1, '00000000-0000-0000-0000-000000000001', 'admin')
         ON CONFLICT (email) DO UPDATE SET intended_role = 'admin';`,
        [adminEmail.toLowerCase().trim()]
      );
      console.log(`Admin invitation active for ${adminEmail}!`);
    }

    // 4. Verify Chargers
    const chargersRes = await client.query('SELECT id, display_name, enabled FROM public.chargers ORDER BY display_name;');
    console.log('\nVerification - Available Chargers in Database:');
    console.table(chargersRes.rows);

    console.log('\nAll done! Your Supabase database is completely configured and ready for reservations.');
  } catch (err) {
    console.error('Database setup failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
