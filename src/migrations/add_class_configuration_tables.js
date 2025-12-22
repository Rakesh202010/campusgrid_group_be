import prismaAdmin from '../lib/prisma.js';
import { getGroupDbClient } from '../lib/groupDb.js';

/**
 * Migration: Add class configuration tables to all group databases
 * 
 * Tables:
 * - class_grades: Class/Grade definitions (Class 1, Class 2, etc.)
 * - sections: Section definitions (A, B, C, etc.)
 * - class_sections: Mapping of grades to sections with capacity and teacher
 */
export async function migrateClassConfigurationTables() {
  console.log('🚀 Starting class configuration tables migration...');

  try {
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

    console.log('✅ Class configuration tables migration completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function migrateGroupDatabase(groupId, dbName) {
  const dbClient = await getGroupDbClient(groupId);

  try {
    // Create class_grades table (Class definitions)
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS class_grades (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(50) NOT NULL,
        display_name VARCHAR(100) NOT NULL,
        numeric_value INTEGER,
        description TEXT,
        order_index INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
        academic_session_id UUID REFERENCES academic_sessions(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(school_id, name, academic_session_id)
      );
    `);

    // Create sections table (Section definitions)
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS sections (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(20) NOT NULL,
        display_name VARCHAR(50),
        description TEXT,
        order_index INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(school_id, name)
      );
    `);

    // Create class_sections table (Grade-Section mapping with details)
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS class_sections (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        class_grade_id UUID NOT NULL REFERENCES class_grades(id) ON DELETE CASCADE,
        section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
        
        -- Capacity and assignment
        capacity INTEGER DEFAULT 40,
        current_strength INTEGER DEFAULT 0,
        
        -- Room assignment
        room_number VARCHAR(50),
        building VARCHAR(100),
        floor VARCHAR(20),
        
        -- Teacher assignments
        class_teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
        
        -- Academic info
        academic_session_id UUID REFERENCES academic_sessions(id) ON DELETE SET NULL,
        
        -- Status
        is_active BOOLEAN DEFAULT true,
        
        -- Metadata
        school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        UNIQUE(class_grade_id, section_id, academic_session_id)
      );
    `);

    // Create indexes
    await dbClient.query(`
      CREATE INDEX IF NOT EXISTS idx_class_grades_school ON class_grades(school_id);
      CREATE INDEX IF NOT EXISTS idx_class_grades_active ON class_grades(is_active) WHERE is_active = true;
      CREATE INDEX IF NOT EXISTS idx_class_grades_order ON class_grades(order_index);
      
      CREATE INDEX IF NOT EXISTS idx_sections_school ON sections(school_id);
      CREATE INDEX IF NOT EXISTS idx_sections_active ON sections(is_active) WHERE is_active = true;
      
      CREATE INDEX IF NOT EXISTS idx_class_sections_school ON class_sections(school_id);
      CREATE INDEX IF NOT EXISTS idx_class_sections_grade ON class_sections(class_grade_id);
      CREATE INDEX IF NOT EXISTS idx_class_sections_section ON class_sections(section_id);
      CREATE INDEX IF NOT EXISTS idx_class_sections_session ON class_sections(academic_session_id);
      CREATE INDEX IF NOT EXISTS idx_class_sections_teacher ON class_sections(class_teacher_id);
    `);

    console.log(`✅ Created class configuration tables for group ${groupId} (${dbName})`);

  } finally {
    await dbClient.end();
  }
}

// Run migration if executed directly
if (process.argv[1].includes('add_class_configuration_tables')) {
  migrateClassConfigurationTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

