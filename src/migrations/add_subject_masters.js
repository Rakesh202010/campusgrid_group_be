import { Client } from 'pg';
import prismaAdmin from '../lib/prisma.js';

/**
 * Migration to add subject_categories and subject_types master tables
 */
export async function migrateSubjectMasters() {
  console.log('Starting subject masters migration...\n');

  try {
    // Get all active school groups
    const groups = await prismaAdmin.schoolGroup.findMany({
      where: { status: { in: ['Active', 'active'] } },
      select: { id: true, dbName: true, dbHost: true, dbUser: true, dbPassword: true },
    });

    if (groups.length === 0) {
      console.log('No active school groups found.');
      return;
    }

    for (const group of groups) {
      console.log(`Migrating database: ${group.dbName}`);

      const dbClient = new Client({
        host: group.dbHost === 'localhost' ? 'postgres_schools' : group.dbHost,
        port: 5432,
        user: group.dbUser,
        password: group.dbPassword,
        database: group.dbName,
      });

      try {
        await dbClient.connect();

        // Create subject_categories table
        await dbClient.query(`
          CREATE TABLE IF NOT EXISTS subject_categories (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            code VARCHAR(50) UNIQUE NOT NULL,
            display_name VARCHAR(150),
            description TEXT,
            color VARCHAR(20) DEFAULT '#6366F1',
            order_index INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(school_id, code)
          );
        `);

        // Create subject_types table
        await dbClient.query(`
          CREATE TABLE IF NOT EXISTS subject_types (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            code VARCHAR(50) UNIQUE NOT NULL,
            display_name VARCHAR(150),
            description TEXT,
            order_index INTEGER DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(school_id, code)
          );
        `);

        // Create indexes
        await dbClient.query(`
          CREATE INDEX IF NOT EXISTS idx_subject_categories_school ON subject_categories(school_id);
          CREATE INDEX IF NOT EXISTS idx_subject_types_school ON subject_types(school_id);
        `);

        // Insert default categories if table is empty
        const categoryCheck = await dbClient.query('SELECT COUNT(*) as count FROM subject_categories');
        if (parseInt(categoryCheck.rows[0].count) === 0) {
          const defaultCategories = [
            { name: 'Core Subject', code: 'core', color: '#3B82F6', order: 1 },
            { name: 'Elective', code: 'elective', color: '#8B5CF6', order: 2 },
            { name: 'Language', code: 'language', color: '#F59E0B', order: 3 },
            { name: 'Vocational', code: 'vocational', color: '#10B981', order: 4 },
            { name: 'Co-Curricular', code: 'co-curricular', color: '#EC4899', order: 5 },
          ];

          // Get school_id (assuming first school or we need to handle multiple schools)
          const schoolResult = await dbClient.query('SELECT id FROM schools LIMIT 1');
          if (schoolResult.rows.length > 0) {
            const schoolId = schoolResult.rows[0].id;
            for (const cat of defaultCategories) {
              await dbClient.query(
                `INSERT INTO subject_categories (name, code, display_name, color, order_index, school_id)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (school_id, code) DO NOTHING`,
                [cat.name, cat.code, cat.name, cat.color, cat.order, schoolId]
              );
            }
            console.log(`  ✓ Inserted default categories for ${group.dbName}`);
          }
        }

        // Insert default types if table is empty
        const typeCheck = await dbClient.query('SELECT COUNT(*) as count FROM subject_types');
        if (parseInt(typeCheck.rows[0].count) === 0) {
          const defaultTypes = [
            { name: 'Theory', code: 'theory', order: 1 },
            { name: 'Practical', code: 'practical', order: 2 },
            { name: 'Theory & Practical', code: 'both', order: 3 },
          ];

          const schoolResult = await dbClient.query('SELECT id FROM schools LIMIT 1');
          if (schoolResult.rows.length > 0) {
            const schoolId = schoolResult.rows[0].id;
            for (const type of defaultTypes) {
              await dbClient.query(
                `INSERT INTO subject_types (name, code, display_name, order_index, school_id)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (school_id, code) DO NOTHING`,
                [type.name, type.code, type.name, type.order, schoolId]
              );
            }
            console.log(`  ✓ Inserted default types for ${group.dbName}`);
          }
        }

        console.log(`  ✓ Migration completed for ${group.dbName}\n`);
      } catch (error) {
        console.error(`  ✗ Error migrating ${group.dbName}:`, error.message);
      } finally {
        await dbClient.end();
      }
    }

    console.log('Subject masters migration completed!\n');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateSubjectMasters()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

