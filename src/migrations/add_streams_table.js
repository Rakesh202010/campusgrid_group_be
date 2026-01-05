import { Client } from 'pg';
import prismaAdmin from '../lib/prisma.js';

/**
 * Migration to add streams/courses table for higher-class academic specialization
 */
export async function migrateStreams() {
  console.log('Starting streams migration...\n');

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

        // Create streams table
        await dbClient.query(`
          CREATE TABLE IF NOT EXISTS streams (
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

        // Create index
        await dbClient.query(`
          CREATE INDEX IF NOT EXISTS idx_streams_school ON streams(school_id);
        `);

        // Add stream_id column to students table if it doesn't exist
        await dbClient.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name='students' AND column_name='stream_id'
            ) THEN
              ALTER TABLE students ADD COLUMN stream_id UUID REFERENCES streams(id) ON DELETE SET NULL;
              CREATE INDEX IF NOT EXISTS idx_students_stream ON students(stream_id);
            END IF;
          END
          $$;
        `);

        // Insert default streams if table is empty
        const streamCheck = await dbClient.query('SELECT COUNT(*) as count FROM streams');
        if (parseInt(streamCheck.rows[0].count) === 0) {
          const defaultStreams = [
            { name: 'Science', code: 'SCIENCE', color: '#3B82F6', order: 1, description: 'Science stream with Physics, Chemistry, Biology/Mathematics' },
            { name: 'Commerce', code: 'COMMERCE', color: '#10B981', order: 2, description: 'Commerce stream with Accountancy, Business Studies, Economics' },
            { name: 'Arts', code: 'ARTS', color: '#EC4899', order: 3, description: 'Arts/Humanities stream with History, Geography, Literature' },
            { name: 'Science (PCM)', code: 'PCM', color: '#8B5CF6', order: 4, description: 'Physics, Chemistry, Mathematics' },
            { name: 'Science (PCB)', code: 'PCB', color: '#06B6D4', order: 5, description: 'Physics, Chemistry, Biology' },
          ];

          const schoolResult = await dbClient.query('SELECT id FROM schools LIMIT 1');
          if (schoolResult.rows.length > 0) {
            const schoolId = schoolResult.rows[0].id;
            for (const stream of defaultStreams) {
              await dbClient.query(
                `INSERT INTO streams (name, code, display_name, description, color, order_index, school_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)
                 ON CONFLICT (school_id, code) DO NOTHING`,
                [stream.name, stream.code, stream.name, stream.description, stream.color, stream.order, schoolId]
              );
            }
            console.log(`  ✓ Inserted default streams for ${group.dbName}`);
          }
        }

        console.log(`  ✓ Migration completed for ${group.dbName}\n`);
      } catch (error) {
        console.error(`  ✗ Error migrating ${group.dbName}:`, error.message);
      } finally {
        await dbClient.end();
      }
    }

    console.log('Streams migration completed!\n');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateStreams()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

