/**
 * Migration: Add pending_acceptance and declined to roster_status enum
 */

import pg from 'pg';

const { Pool } = pg;

const DB_CONFIG = {
  user: process.env.PGUSER || 'school_admin',
  host: process.env.PGHOST || 'campusgrid_postgres_schools',
  database: process.env.PGDATABASE || 'postgres',
  password: process.env.PGPASSWORD || 'school123',
  port: process.env.PGPORT || 5432,
};

async function runMigration() {
  const adminPool = new Pool(DB_CONFIG);
  
  try {
    console.log('🚀 Starting roster_status enum migration...');
    
    // Get all school databases
    const dbResult = await adminPool.query(`
      SELECT datname FROM pg_database 
      WHERE datname LIKE 'campusgrid_group_%' AND datistemplate = false
    `);
    
    for (const row of dbResult.rows) {
      const dbName = row.datname;
      console.log(`\n📚 Processing: ${dbName}`);
      
      const schoolPool = new Pool({ ...DB_CONFIG, database: dbName });
      
      try {
        // Check if enum type exists
        const enumCheck = await schoolPool.query(`
          SELECT EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'roster_status'
          )
        `);
        
        if (!enumCheck.rows[0].exists) {
          console.log(`  ⚠️ Skipping ${dbName}: roster_status enum doesn't exist`);
          await schoolPool.end();
          continue;
        }
        
        // Add pending_acceptance to the enum if not exists
        await schoolPool.query(`
          DO $$ BEGIN
            ALTER TYPE roster_status ADD VALUE IF NOT EXISTS 'pending_acceptance';
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);
        console.log(`  ✓ Added pending_acceptance to roster_status enum`);
        
        // Add declined to the enum if not exists
        await schoolPool.query(`
          DO $$ BEGIN
            ALTER TYPE roster_status ADD VALUE IF NOT EXISTS 'declined';
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);
        console.log(`  ✓ Added declined to roster_status enum`);
        
        console.log(`  ✅ Migration completed for ${dbName}`);
        
      } catch (err) {
        console.error(`  ❌ Error processing ${dbName}:`, err.message);
      } finally {
        await schoolPool.end();
      }
    }
    
    console.log('\n✅ Roster status enum migration completed!');
    
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await adminPool.end();
  }
}

runMigration().then(() => {
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

