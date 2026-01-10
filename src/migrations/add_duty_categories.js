/**
 * Migration: Add Duty Categories Table
 * 
 * Creates dynamic duty categories that can be configured by admin
 */

import pg from 'pg';
const { Pool } = pg;

const SCHOOL_DB_CONFIG = {
  host: process.env.DB_SCHOOLS_HOST || 'postgres_schools',
  port: process.env.DB_SCHOOLS_PORT || 5432,
  user: process.env.DB_SCHOOLS_USER || 'school_admin',
  password: process.env.DB_SCHOOLS_PASSWORD || 'school123',
  database: 'postgres'
};

async function runMigration() {
  const pool = new Pool(SCHOOL_DB_CONFIG);
  
  try {
    // Get all school databases
    const dbResult = await pool.query(`
      SELECT datname FROM pg_database 
      WHERE datname LIKE 'campusgrid_group_%' 
      AND datname != 'campusgrid_group_template'
      AND datistemplate = false
    `);
    
    console.log(`Found ${dbResult.rows.length} school databases to migrate`);
    
    for (const row of dbResult.rows) {
      const dbName = row.datname;
      console.log(`\nMigrating database: ${dbName}`);
      
      const schoolPool = new Pool({
        ...SCHOOL_DB_CONFIG,
        database: dbName
      });
      
      try {
        await schoolPool.query('BEGIN');
        
        // Create duty_categories table
        await schoolPool.query(`
          CREATE TABLE IF NOT EXISTS duty_categories (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id UUID REFERENCES schools(id),
            code VARCHAR(50) NOT NULL,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            color VARCHAR(20) DEFAULT '#6B7280',
            icon VARCHAR(50),
            display_order INT DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(school_id, code)
          )
        `);
        
        // Add category_id column to duty_master if it doesn't exist
        await schoolPool.query(`
          DO $$ 
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM information_schema.columns 
              WHERE table_name = 'duty_master' AND column_name = 'category_id'
            ) THEN
              ALTER TABLE duty_master ADD COLUMN category_id UUID REFERENCES duty_categories(id);
            END IF;
          END $$;
        `);
        
        // Get school ID
        const schoolResult = await schoolPool.query('SELECT id FROM schools LIMIT 1');
        if (schoolResult.rows.length > 0) {
          const schoolId = schoolResult.rows[0].id;
          
          // Seed default categories
          const defaultCategories = [
            { code: 'ACADEMIC', name: 'Academic', color: '#3B82F6', description: 'Academic related duties', display_order: 1 },
            { code: 'OPERATIONAL', name: 'Operational', color: '#F59E0B', description: 'Daily operational duties', display_order: 2 },
            { code: 'STUDENT_LEADERSHIP', name: 'Student Leadership', color: '#8B5CF6', description: 'Student leadership roles', display_order: 3 },
            { code: 'EVENT', name: 'Event', color: '#10B981', description: 'Event coordination', display_order: 4 },
            { code: 'TRANSPORT', name: 'Transport', color: '#06B6D4', description: 'Transport supervision', display_order: 5 },
            { code: 'EXAM', name: 'Exam', color: '#EF4444', description: 'Examination duties', display_order: 6 },
            { code: 'SPORTS', name: 'Sports', color: '#14B8A6', description: 'Sports activities', display_order: 7 },
            { code: 'LIBRARY', name: 'Library', color: '#A855F7', description: 'Library duties', display_order: 8 },
            { code: 'DISCIPLINE', name: 'Discipline', color: '#F97316', description: 'Discipline committee', display_order: 9 },
            { code: 'OTHER', name: 'Other', color: '#6B7280', description: 'Other duties', display_order: 10 }
          ];
          
          for (const cat of defaultCategories) {
            await schoolPool.query(`
              INSERT INTO duty_categories (school_id, code, name, description, color, display_order)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (school_id, code) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                color = EXCLUDED.color,
                display_order = EXCLUDED.display_order
            `, [schoolId, cat.code, cat.name, cat.description, cat.color, cat.display_order]);
          }
          
          // Update existing duties to use category_id based on category enum
          const categoryMapping = {
            'academic': 'ACADEMIC',
            'operational': 'OPERATIONAL',
            'student_leadership': 'STUDENT_LEADERSHIP',
            'event': 'EVENT',
            'transport': 'TRANSPORT',
            'exam': 'EXAM'
          };
          
          for (const [enumVal, code] of Object.entries(categoryMapping)) {
            await schoolPool.query(`
              UPDATE duty_master dm
              SET category_id = dc.id
              FROM duty_categories dc
              WHERE dm.school_id = $1 
                AND dc.school_id = $1
                AND dc.code = $2
                AND dm.category::text = $3
                AND dm.category_id IS NULL
            `, [schoolId, code, enumVal]);
          }
          
          console.log(`  ✓ Seeded duty categories for ${dbName}`);
        }
        
        await schoolPool.query('COMMIT');
        console.log(`  ✓ Migration completed for ${dbName}`);
        
      } catch (err) {
        await schoolPool.query('ROLLBACK');
        console.error(`  ✗ Error migrating ${dbName}:`, err.message);
      } finally {
        await schoolPool.end();
      }
    }
    
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await pool.end();
  }
}

// Run migration
runMigration().then(() => {
  console.log('\n✓ Duty categories migration completed');
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

