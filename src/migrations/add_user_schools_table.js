/**
 * Migration: Add user_schools junction table for many-to-many relationship
 * Allows users (school_admins) to belong to multiple schools
 */

import pg from 'pg';
import { getGroupDbClient, getGroupDbInfo } from '../lib/groupDb.js';
import prismaAdmin from '../lib/prisma.js';

const { Client } = pg;

/**
 * Run migration on all group databases
 */
export async function migrateUserSchoolsTable() {
  try {
    // Get all active groups
    const groups = await prismaAdmin.schoolGroup.findMany({
      where: { status: { in: ['Active', 'active'] } },
      select: {
        id: true,
        dbName: true,
        subdomain: true
      }
    });

    console.log(`Found ${groups.length} active groups to migrate`);

    for (const group of groups) {
      try {
        await migrateGroupDatabase(group.id);
        console.log(`✅ Migrated group: ${group.subdomain} (${group.dbName})`);
      } catch (error) {
        console.error(`❌ Error migrating group ${group.id}:`, error.message);
      }
    }

    console.log('✅ Migration complete');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

/**
 * Migrate a single group database
 */
async function migrateGroupDatabase(groupId) {
  const dbClient = await getGroupDbClient(groupId);

  try {
    // Create user_schools junction table
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS user_schools (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID NOT NULL,
        user_type VARCHAR(50) NOT NULL DEFAULT 'school_admin', -- school_admin, teacher, etc.
        school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
        role VARCHAR(50) DEFAULT 'admin', -- admin, principal, vice_principal, teacher
        is_primary BOOLEAN DEFAULT false, -- Primary school assignment
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(user_id, user_type, school_id)
      );
    `);

    // Create indexes
    await dbClient.query(`
      CREATE INDEX IF NOT EXISTS idx_user_schools_user_id ON user_schools(user_id, user_type);
      CREATE INDEX IF NOT EXISTS idx_user_schools_school_id ON user_schools(school_id);
      CREATE INDEX IF NOT EXISTS idx_user_schools_primary ON user_schools(user_id, user_type, is_primary) WHERE is_primary = true;
    `);

    // Migrate existing school_admins to user_schools
    // For existing admins, create entries in user_schools based on their school_id
    await dbClient.query(`
      INSERT INTO user_schools (user_id, user_type, school_id, role, is_primary)
      SELECT 
        sa.id as user_id,
        'school_admin' as user_type,
        sa.school_id,
        sa.role,
        true as is_primary
      FROM school_admins sa
      WHERE NOT EXISTS (
        SELECT 1 FROM user_schools us 
        WHERE us.user_id = sa.id 
        AND us.user_type = 'school_admin' 
        AND us.school_id = sa.school_id
      )
      ON CONFLICT (user_id, user_type, school_id) DO NOTHING;
    `);

    console.log(`✅ Created user_schools table and migrated existing data for group ${groupId}`);
  } finally {
    await dbClient.end();
  }
}

/**
 * Add subdomain (tenant) column to school_groups if needed
 */
async function addSubdomainColumn() {
  // This is already in the schema, but we can verify
  // The subdomain column should already exist in the admin DB
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateUserSchoolsTable()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

