/**
 * Migration: Add subjects and class_subjects tables
 * 
 * This creates:
 * - subjects: Master list of subjects (Math, Science, English, etc.)
 * - class_subjects: Junction table linking subjects to class-sections per academic session
 */

import { Client } from 'pg';
import prismaAdmin from '../lib/prisma.js';

async function runMigration() {
  console.log('Starting subjects tables migration...\n');

  // Get all active school groups
  const groups = await prismaAdmin.schoolGroup.findMany({
    where: {
      status: {
        in: ['Active', 'active']
      }
    },
    select: {
      id: true,
      dbName: true,
      dbHost: true,
      dbUser: true,
      dbPassword: true
    }
  });

  console.log(`Found ${groups.length} active groups to migrate\n`);

  for (const group of groups) {
    console.log(`Migrating database: ${group.dbName}`);
    
    const dbClient = new Client({
      host: group.dbHost === 'localhost' ? 'postgres_schools' : group.dbHost,
      port: 5432,
      user: group.dbUser,
      password: group.dbPassword,
      database: group.dbName
    });

    try {
      await dbClient.connect();

      // Create subjects table
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS subjects (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(100) NOT NULL,
          code VARCHAR(20) UNIQUE NOT NULL,
          display_name VARCHAR(150),
          description TEXT,
          category VARCHAR(50) DEFAULT 'core', -- core, elective, language, vocational, co-curricular
          subject_type VARCHAR(50) DEFAULT 'theory', -- theory, practical, both
          is_mandatory BOOLEAN DEFAULT true,
          credit_hours INTEGER DEFAULT 0,
          max_marks INTEGER DEFAULT 100,
          passing_marks INTEGER DEFAULT 33,
          order_index INTEGER DEFAULT 0,
          color VARCHAR(20) DEFAULT '#3B82F6', -- For UI display
          icon VARCHAR(50), -- Icon name for UI
          is_active BOOLEAN DEFAULT true,
          school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(school_id, code)
        );
      `);

      // Create class_subjects table (curriculum mapping)
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS class_subjects (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          class_section_id UUID NOT NULL REFERENCES class_sections(id) ON DELETE CASCADE,
          subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          academic_session_id UUID REFERENCES academic_sessions(id) ON DELETE SET NULL,
          teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
          periods_per_week INTEGER DEFAULT 5,
          is_optional BOOLEAN DEFAULT false,
          syllabus_url TEXT,
          notes TEXT,
          is_active BOOLEAN DEFAULT true,
          school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(class_section_id, subject_id, academic_session_id)
        );
      `);

      // Create indexes
      await dbClient.query(`
        CREATE INDEX IF NOT EXISTS idx_subjects_school ON subjects(school_id);
        CREATE INDEX IF NOT EXISTS idx_subjects_category ON subjects(category);
        CREATE INDEX IF NOT EXISTS idx_subjects_code ON subjects(code);
        CREATE INDEX IF NOT EXISTS idx_class_subjects_class_section ON class_subjects(class_section_id);
        CREATE INDEX IF NOT EXISTS idx_class_subjects_subject ON class_subjects(subject_id);
        CREATE INDEX IF NOT EXISTS idx_class_subjects_session ON class_subjects(academic_session_id);
        CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher ON class_subjects(teacher_id);
      `);

      console.log(`✅ Created subjects tables for: ${group.dbName}`);

    } catch (error) {
      console.error(`❌ Error migrating ${group.dbName}:`, error.message);
    } finally {
      await dbClient.end();
    }
  }

  console.log('\n✅ Subjects tables migration completed!');
}

// Run migration
runMigration()
  .catch(console.error)
  .finally(() => prismaAdmin.$disconnect());

