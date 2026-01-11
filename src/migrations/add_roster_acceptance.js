/**
 * Migration: Add acceptance/decline workflow columns to roster_assignments
 * 
 * This adds:
 * - completed_at, completed_by for marking duties complete
 * - accepted_at, accepted_by for acceptance workflow  
 * - declined_at, declined_by, decline_reason for decline workflow
 * - acceptance_status for tracking pending/accepted/declined
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
    console.log('🚀 Starting roster acceptance workflow migration...');
    
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
        // Check if table exists
        const tableCheck = await schoolPool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'roster_assignments'
          )
        `);
        
        if (!tableCheck.rows[0].exists) {
          console.log(`  ⚠️ Skipping ${dbName}: roster_assignments table doesn't exist`);
          await schoolPool.end();
          continue;
        }
        
        // Add new columns for completion tracking
        await schoolPool.query(`
          ALTER TABLE roster_assignments 
          ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS completed_by UUID
        `);
        console.log(`  ✓ Added completion columns`);
        
        // Add new columns for acceptance workflow
        await schoolPool.query(`
          ALTER TABLE roster_assignments 
          ADD COLUMN IF NOT EXISTS acceptance_status VARCHAR(20) DEFAULT 'pending',
          ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS accepted_by UUID,
          ADD COLUMN IF NOT EXISTS declined_at TIMESTAMP WITH TIME ZONE,
          ADD COLUMN IF NOT EXISTS declined_by UUID,
          ADD COLUMN IF NOT EXISTS decline_reason TEXT,
          ADD COLUMN IF NOT EXISTS requires_acceptance BOOLEAN DEFAULT false
        `);
        console.log(`  ✓ Added acceptance workflow columns`);
        
        // Update existing assignments to have 'accepted' status (backward compatibility)
        await schoolPool.query(`
          UPDATE roster_assignments 
          SET acceptance_status = 'accepted' 
          WHERE acceptance_status IS NULL OR acceptance_status = 'pending'
        `);
        console.log(`  ✓ Updated existing assignments to accepted status`);
        
        console.log(`  ✅ Migration completed for ${dbName}`);
        
      } catch (err) {
        console.error(`  ❌ Error processing ${dbName}:`, err.message);
      } finally {
        await schoolPool.end();
      }
    }
    
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await adminPool.end();
  }
}

runMigration().then(() => {
  console.log('\n✅ Roster acceptance workflow migration completed!');
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

