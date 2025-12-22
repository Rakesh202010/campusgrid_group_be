import prismaAdmin from '../lib/prisma.js';
import { getGroupDbClient } from '../lib/groupDb.js';

/**
 * Migration: Add academic_sessions table to all group databases
 * 
 * Academic sessions are school year periods (e.g., 2024-2025) with:
 * - Start and end dates
 * - Active status (only one can be active at a time)
 * - Configuration for terms/semesters
 */
export async function migrateAcademicSessionsTable() {
  console.log('🚀 Starting academic_sessions table migration...');

  try {
    // Get all active groups
    const groups = await prismaAdmin.schoolGroup.findMany({
      where: {
        status: { in: ['Active', 'active'] }
      }
    });

    console.log(`📊 Found ${groups.length} groups to migrate`);

    for (const group of groups) {
      try {
        await migrateGroupDatabase(group.id, group.dbName);
      } catch (error) {
        console.error(`❌ Error migrating group ${group.id}:`, error.message);
      }
    }

    console.log('✅ Academic sessions migration completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Migrate a single group database
 */
async function migrateGroupDatabase(groupId, dbName) {
  const dbClient = await getGroupDbClient(groupId);

  try {
    // Create academic_sessions table
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS academic_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        is_current BOOLEAN DEFAULT false,
        status VARCHAR(20) DEFAULT 'active',
        
        -- Term/Semester configuration
        term_type VARCHAR(50) DEFAULT 'annual',
        terms JSONB DEFAULT '[]',
        
        -- Additional settings
        description TEXT,
        settings JSONB DEFAULT '{}',
        
        -- School reference (optional, for multi-school groups)
        school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
        
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_by UUID,
        
        CONSTRAINT valid_dates CHECK (end_date > start_date),
        CONSTRAINT valid_status CHECK (status IN ('active', 'inactive', 'completed', 'upcoming'))
      );
    `);

    // Create indexes
    await dbClient.query(`
      CREATE INDEX IF NOT EXISTS idx_academic_sessions_school_id ON academic_sessions(school_id);
      CREATE INDEX IF NOT EXISTS idx_academic_sessions_is_current ON academic_sessions(is_current) WHERE is_current = true;
      CREATE INDEX IF NOT EXISTS idx_academic_sessions_status ON academic_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_academic_sessions_dates ON academic_sessions(start_date, end_date);
    `);

    // Create trigger to ensure only one current session per school
    await dbClient.query(`
      CREATE OR REPLACE FUNCTION ensure_single_current_session()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.is_current = true THEN
          UPDATE academic_sessions 
          SET is_current = false, updated_at = NOW()
          WHERE school_id = NEW.school_id 
            AND id != NEW.id 
            AND is_current = true;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await dbClient.query(`
      DROP TRIGGER IF EXISTS trigger_single_current_session ON academic_sessions;
      CREATE TRIGGER trigger_single_current_session
        BEFORE INSERT OR UPDATE ON academic_sessions
        FOR EACH ROW
        EXECUTE FUNCTION ensure_single_current_session();
    `);

    console.log(`✅ Created academic_sessions table for group ${groupId} (${dbName})`);

  } finally {
    await dbClient.end();
  }
}

// Run migration if executed directly
if (process.argv[1].includes('add_academic_sessions_table')) {
  migrateAcademicSessionsTable()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

