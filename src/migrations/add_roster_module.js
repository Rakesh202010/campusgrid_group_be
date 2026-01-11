/**
 * Migration: Add Roster & Duties Module Tables
 * 
 * This creates all tables needed for the comprehensive Roster & Duties system:
 * - Master tables (duties, roster types, time slots, locations, duty roles)
 * - Core roster assignment engine
 * - Audit logging
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
      WHERE datname LIKE 'campusgrid_group_%' AND datistemplate = false
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
        
        // ============================================
        // 1. DUTY CATEGORY ENUM
        // ============================================
        await schoolPool.query(`
          DO $$ BEGIN
            CREATE TYPE duty_category AS ENUM ('academic', 'operational', 'student_leadership', 'event', 'transport', 'exam');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);
        
        // ============================================
        // 2. RISK LEVEL ENUM
        // ============================================
        await schoolPool.query(`
          DO $$ BEGIN
            CREATE TYPE risk_level AS ENUM ('low', 'medium', 'high');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);
        
        // ============================================
        // 3. ASSIGNEE TYPE ENUM
        // ============================================
        await schoolPool.query(`
          DO $$ BEGIN
            CREATE TYPE assignee_type AS ENUM ('teacher', 'staff', 'student');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);
        
        // ============================================
        // 4. ROSTER STATUS ENUM
        // ============================================
        await schoolPool.query(`
          DO $$ BEGIN
            CREATE TYPE roster_status AS ENUM ('scheduled', 'active', 'completed', 'cancelled', 'pending_approval', 'pending_acceptance', 'declined');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);
        
        // ============================================
        // 5. LOCATION TYPE ENUM
        // ============================================
        await schoolPool.query(`
          DO $$ BEGIN
            CREATE TYPE location_type AS ENUM ('gate', 'ground', 'building', 'classroom', 'corridor', 'office', 'lab', 'library', 'cafeteria', 'other');
          EXCEPTION
            WHEN duplicate_object THEN null;
          END $$;
        `);

        // ============================================
        // TABLE 1: ROSTER TYPE MASTER
        // ============================================
        await schoolPool.query(`
          CREATE TABLE IF NOT EXISTS roster_types (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id UUID REFERENCES schools(id),
            code VARCHAR(50) NOT NULL,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            color VARCHAR(20) DEFAULT '#3B82F6',
            icon VARCHAR(50),
            is_system BOOLEAN DEFAULT false,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(school_id, code)
          )
        `);
        
        // ============================================
        // TABLE 2: TIME SLOT MASTER
        // ============================================
        await schoolPool.query(`
          CREATE TABLE IF NOT EXISTS duty_time_slots (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id UUID REFERENCES schools(id),
            name VARCHAR(100) NOT NULL,
            code VARCHAR(50) NOT NULL,
            start_time TIME NOT NULL,
            end_time TIME NOT NULL,
            applies_to_days VARCHAR(20)[] DEFAULT ARRAY['mon','tue','wed','thu','fri','sat'],
            is_active BOOLEAN DEFAULT true,
            display_order INT DEFAULT 0,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(school_id, code)
          )
        `);
        
        // ============================================
        // TABLE 3: LOCATION/ZONE MASTER
        // ============================================
        await schoolPool.query(`
          CREATE TABLE IF NOT EXISTS duty_locations (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id UUID REFERENCES schools(id),
            name VARCHAR(100) NOT NULL,
            code VARCHAR(50) NOT NULL,
            type location_type DEFAULT 'other',
            building VARCHAR(100),
            floor VARCHAR(20),
            capacity INT,
            description TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(school_id, code)
          )
        `);
        
        // ============================================
        // TABLE 4: DUTY ROLE MASTER
        // ============================================
        await schoolPool.query(`
          CREATE TABLE IF NOT EXISTS duty_roles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id UUID REFERENCES schools(id),
            name VARCHAR(100) NOT NULL,
            code VARCHAR(50) NOT NULL,
            description TEXT,
            priority INT DEFAULT 0,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(school_id, code)
          )
        `);
        
        // ============================================
        // TABLE 5: DUTY/TASK MASTER
        // ============================================
        await schoolPool.query(`
          CREATE TABLE IF NOT EXISTS duty_master (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id UUID REFERENCES schools(id),
            name VARCHAR(200) NOT NULL,
            code VARCHAR(50) NOT NULL,
            category duty_category DEFAULT 'operational',
            roster_type_id UUID REFERENCES roster_types(id),
            allowed_assignee_types assignee_type[] DEFAULT ARRAY['teacher', 'staff']::assignee_type[],
            risk_level risk_level DEFAULT 'low',
            supervisor_required BOOLEAN DEFAULT false,
            default_time_slot_id UUID REFERENCES duty_time_slots(id),
            default_location_id UUID REFERENCES duty_locations(id),
            min_assignees INT DEFAULT 1,
            max_assignees INT,
            max_per_week_student INT DEFAULT 2,
            instructions TEXT,
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(school_id, code)
          )
        `);
        
        // ============================================
        // TABLE 6: ROSTER ASSIGNMENTS (CORE ENGINE)
        // ============================================
        await schoolPool.query(`
          CREATE TABLE IF NOT EXISTS roster_assignments (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id UUID REFERENCES schools(id),
            academic_session_id UUID REFERENCES academic_sessions(id),
            roster_type_id UUID REFERENCES roster_types(id) NOT NULL,
            duty_id UUID REFERENCES duty_master(id),
            
            -- Academic context (nullable for non-academic duties)
            class_grade_id UUID REFERENCES class_grades(id),
            class_section_id UUID REFERENCES class_sections(id),
            stream_id UUID REFERENCES streams(id),
            subject_id UUID REFERENCES subjects(id),
            
            -- Time context
            start_date DATE NOT NULL,
            end_date DATE,
            is_recurring BOOLEAN DEFAULT false,
            recurrence_pattern VARCHAR(50),
            recurrence_days VARCHAR(20)[],
            time_slot_id UUID REFERENCES duty_time_slots(id),
            custom_start_time TIME,
            custom_end_time TIME,
            
            -- Location
            location_id UUID REFERENCES duty_locations(id),
            custom_location VARCHAR(200),
            
            -- Assignment
            role_id UUID REFERENCES duty_roles(id),
            assignee_type assignee_type NOT NULL,
            assignee_id UUID NOT NULL,
            supervisor_id UUID,
            
            -- Status & Approval
            status roster_status DEFAULT 'scheduled',
            requires_approval BOOLEAN DEFAULT false,
            approved_by UUID,
            approved_at TIMESTAMP,
            
            -- Completion tracking
            completed_at TIMESTAMP WITH TIME ZONE,
            completed_by UUID,
            
            -- Meta
            notes TEXT,
            priority INT DEFAULT 0,
            is_emergency BOOLEAN DEFAULT false,
            created_by UUID,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        
        // ============================================
        // TABLE 7: ROSTER ASSIGNMENT DATES (Per-day tracking)
        // ============================================
        await schoolPool.query(`
          CREATE TABLE IF NOT EXISTS roster_assignment_dates (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            roster_assignment_id UUID NOT NULL REFERENCES roster_assignments(id) ON DELETE CASCADE,
            date DATE NOT NULL,
            status VARCHAR(30) DEFAULT 'pending_acceptance',
            accepted_at TIMESTAMP WITH TIME ZONE,
            accepted_by UUID,
            declined_at TIMESTAMP WITH TIME ZONE,
            declined_by UUID,
            decline_reason TEXT,
            completed_at TIMESTAMP WITH TIME ZONE,
            completed_by UUID,
            notes TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(roster_assignment_id, date)
          )
        `);
        
        // ============================================
        // TABLE 8: ROSTER AUDIT LOG
        // ============================================
        await schoolPool.query(`
          CREATE TABLE IF NOT EXISTS roster_audit_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id UUID REFERENCES schools(id),
            roster_assignment_id UUID REFERENCES roster_assignments(id),
            action VARCHAR(50) NOT NULL,
            old_values JSONB,
            new_values JSONB,
            reason TEXT,
            performed_by UUID,
            performed_at TIMESTAMP DEFAULT NOW(),
            ip_address VARCHAR(50),
            user_agent TEXT
          )
        `);
        
        // ============================================
        // TABLE 8: DUTY ATTENDANCE
        // ============================================
        await schoolPool.query(`
          CREATE TABLE IF NOT EXISTS duty_attendance (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id UUID REFERENCES schools(id),
            roster_assignment_id UUID REFERENCES roster_assignments(id),
            date DATE NOT NULL,
            check_in_time TIME,
            check_out_time TIME,
            status VARCHAR(20) DEFAULT 'present',
            remarks TEXT,
            marked_by UUID,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(roster_assignment_id, date)
          )
        `);
        
        // ============================================
        // TABLE 9: ROSTER CONFIGURATION
        // ============================================
        await schoolPool.query(`
          CREATE TABLE IF NOT EXISTS roster_config (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id UUID REFERENCES schools(id) UNIQUE,
            student_max_duties_per_week INT DEFAULT 3,
            student_duties_overlap_class BOOLEAN DEFAULT false,
            student_duties_require_approval BOOLEAN DEFAULT true,
            high_risk_requires_approval BOOLEAN DEFAULT true,
            auto_complete_past_duties BOOLEAN DEFAULT true,
            notify_assignees BOOLEAN DEFAULT true,
            notify_supervisors BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `);
        
        // ============================================
        // INDEXES
        // ============================================
        await schoolPool.query(`
          CREATE INDEX IF NOT EXISTS idx_roster_assignments_assignee ON roster_assignments(assignee_type, assignee_id);
          CREATE INDEX IF NOT EXISTS idx_roster_assignments_dates ON roster_assignments(start_date, end_date);
          CREATE INDEX IF NOT EXISTS idx_roster_assignments_status ON roster_assignments(status);
          CREATE INDEX IF NOT EXISTS idx_roster_assignments_duty ON roster_assignments(duty_id);
          CREATE INDEX IF NOT EXISTS idx_roster_audit_logs_assignment ON roster_audit_logs(roster_assignment_id);
          CREATE INDEX IF NOT EXISTS idx_duty_attendance_date ON duty_attendance(date);
        `);
        
        // ============================================
        // SEED DEFAULT DATA
        // ============================================
        
        // Get school ID
        const schoolResult = await schoolPool.query('SELECT id FROM schools LIMIT 1');
        if (schoolResult.rows.length > 0) {
          const schoolId = schoolResult.rows[0].id;
          
          // Seed Roster Types
          await schoolPool.query(`
            INSERT INTO roster_types (school_id, code, name, description, color, is_system) VALUES
            ($1, 'TEACHING', 'Teaching', 'Subject teaching assignments', '#3B82F6', true),
            ($1, 'CLASS_TEACHER', 'Class Teacher', 'Class teacher responsibilities', '#8B5CF6', true),
            ($1, 'DUTY', 'General Duty', 'Daily operational duties', '#F59E0B', true),
            ($1, 'EXAM_DUTY', 'Exam Duty', 'Examination supervision', '#EF4444', true),
            ($1, 'EVENT', 'Event', 'Event coordination duties', '#10B981', true),
            ($1, 'TRANSPORT', 'Transport', 'Bus/transport supervision', '#6366F1', true),
            ($1, 'STUDENT_LEADERSHIP', 'Student Leadership', 'Student leadership roles', '#EC4899', true)
            ON CONFLICT (school_id, code) DO NOTHING
          `, [schoolId]);
          
          // Seed Time Slots
          await schoolPool.query(`
            INSERT INTO duty_time_slots (school_id, code, name, start_time, end_time, display_order) VALUES
            ($1, 'MORNING_GATE', 'Morning Gate Duty', '07:30', '08:15', 1),
            ($1, 'ASSEMBLY', 'Assembly/Prayer', '08:15', '08:45', 2),
            ($1, 'FIRST_HALF', 'First Half', '08:45', '12:00', 3),
            ($1, 'RECESS', 'Recess/Lunch Break', '12:00', '12:45', 4),
            ($1, 'SECOND_HALF', 'Second Half', '12:45', '15:00', 5),
            ($1, 'DISPERSAL', 'Dispersal Duty', '15:00', '15:30', 6),
            ($1, 'AFTER_SCHOOL', 'After School', '15:30', '17:00', 7)
            ON CONFLICT (school_id, code) DO NOTHING
          `, [schoolId]);
          
          // Seed Locations
          await schoolPool.query(`
            INSERT INTO duty_locations (school_id, code, name, type) VALUES
            ($1, 'MAIN_GATE', 'Main Gate', 'gate'),
            ($1, 'BACK_GATE', 'Back Gate', 'gate'),
            ($1, 'ASSEMBLY_GROUND', 'Assembly Ground', 'ground'),
            ($1, 'PLAYGROUND', 'Playground', 'ground'),
            ($1, 'CORRIDOR_A', 'Corridor A (Primary)', 'corridor'),
            ($1, 'CORRIDOR_B', 'Corridor B (Secondary)', 'corridor'),
            ($1, 'CAFETERIA', 'Cafeteria', 'cafeteria'),
            ($1, 'LIBRARY', 'Library', 'library'),
            ($1, 'COMPUTER_LAB', 'Computer Lab', 'lab'),
            ($1, 'SCIENCE_LAB', 'Science Lab', 'lab'),
            ($1, 'STAFF_ROOM', 'Staff Room', 'office'),
            ($1, 'PRINCIPAL_OFFICE', 'Principal Office', 'office'),
            ($1, 'BUS_AREA', 'Bus Parking Area', 'other')
            ON CONFLICT (school_id, code) DO NOTHING
          `, [schoolId]);
          
          // Seed Duty Roles
          await schoolPool.query(`
            INSERT INTO duty_roles (school_id, code, name, description, priority) VALUES
            ($1, 'COORDINATOR', 'Coordinator', 'Overall duty coordinator', 1),
            ($1, 'SUPERVISOR', 'Supervisor', 'Supervises assigned area/students', 2),
            ($1, 'INCHARGE', 'In-Charge', 'Responsible for specific task', 3),
            ($1, 'ASSISTANT', 'Assistant', 'Assists the in-charge', 4),
            ($1, 'VOLUNTEER', 'Volunteer', 'Volunteer helper', 5),
            ($1, 'MONITOR', 'Monitor', 'Class/Section monitor', 6),
            ($1, 'CAPTAIN', 'Captain', 'House/Team captain', 7),
            ($1, 'PREFECT', 'Prefect', 'School prefect', 8)
            ON CONFLICT (school_id, code) DO NOTHING
          `, [schoolId]);
          
          // Get IDs for duty master seeding
          const rosterTypeResult = await schoolPool.query(
            'SELECT id, code FROM roster_types WHERE school_id = $1', [schoolId]
          );
          const timeSlotResult = await schoolPool.query(
            'SELECT id, code FROM duty_time_slots WHERE school_id = $1', [schoolId]
          );
          const locationResult = await schoolPool.query(
            'SELECT id, code FROM duty_locations WHERE school_id = $1', [schoolId]
          );
          
          const rosterTypes = {};
          rosterTypeResult.rows.forEach(r => rosterTypes[r.code] = r.id);
          
          const timeSlots = {};
          timeSlotResult.rows.forEach(r => timeSlots[r.code] = r.id);
          
          const locations = {};
          locationResult.rows.forEach(r => locations[r.code] = r.id);
          
          // Seed Duty Master
          await schoolPool.query(`
            INSERT INTO duty_master (
              school_id, code, name, category, roster_type_id, 
              allowed_assignee_types, risk_level, supervisor_required,
              default_time_slot_id, default_location_id, min_assignees, max_assignees, instructions
            ) VALUES
            ($1, 'MORNING_GATE_DUTY', 'Morning Gate Duty', 'operational', $2,
             ARRAY['teacher', 'staff']::assignee_type[], 'low', false,
             $3, $4, 2, 4, 'Monitor student entry, check uniforms, ensure safety'),
            ($1, 'PRAYER_DUTY', 'Prayer/Assembly Duty', 'operational', $2,
             ARRAY['teacher']::assignee_type[], 'low', false,
             $5, $6, 2, 6, 'Conduct morning assembly, lead prayer, make announcements'),
            ($1, 'RECESS_DUTY', 'Recess Supervision', 'operational', $2,
             ARRAY['teacher', 'staff']::assignee_type[], 'medium', false,
             $7, $8, 3, 6, 'Supervise students during break, ensure safety in playground'),
            ($1, 'DISPERSAL_DUTY', 'Dispersal Duty', 'operational', $2,
             ARRAY['teacher', 'staff']::assignee_type[], 'medium', false,
             $9, $4, 2, 4, 'Monitor safe departure of students, manage parent pickup'),
            ($1, 'BUS_DUTY', 'Bus Supervision', 'transport', $10,
             ARRAY['teacher', 'staff']::assignee_type[], 'medium', false,
             $9, $11, 1, 3, 'Ensure safe boarding/deboarding from school buses'),
            ($1, 'CORRIDOR_DUTY', 'Corridor Supervision', 'operational', $2,
             ARRAY['teacher', 'staff']::assignee_type[], 'low', false,
             NULL, NULL, 1, 2, 'Monitor corridors during class change'),
            ($1, 'EXAM_INVIGILATION', 'Exam Invigilation', 'exam', $12,
             ARRAY['teacher']::assignee_type[], 'high', false,
             NULL, NULL, 1, 2, 'Supervise examination hall, maintain exam integrity'),
            ($1, 'CLASS_MONITOR', 'Class Monitor', 'student_leadership', $13,
             ARRAY['student']::assignee_type[], 'low', true,
             NULL, NULL, 1, 2, 'Maintain class discipline, assist teachers'),
            ($1, 'HOUSE_CAPTAIN', 'House Captain', 'student_leadership', $13,
             ARRAY['student']::assignee_type[], 'low', true,
             NULL, NULL, 1, 1, 'Lead house activities, coordinate house events'),
            ($1, 'LIBRARY_MONITOR', 'Library Monitor', 'student_leadership', $13,
             ARRAY['student']::assignee_type[], 'low', true,
             NULL, $14, 1, 2, 'Assist librarian, maintain book records'),
            ($1, 'EVENT_VOLUNTEER', 'Event Volunteer', 'event', $15,
             ARRAY['teacher', 'staff', 'student']::assignee_type[], 'low', true,
             NULL, NULL, 5, 20, 'Assist in school events and functions')
            ON CONFLICT (school_id, code) DO NOTHING
          `, [
            schoolId, 
            rosterTypes['DUTY'], 
            timeSlots['MORNING_GATE'], locations['MAIN_GATE'],
            timeSlots['ASSEMBLY'], locations['ASSEMBLY_GROUND'],
            timeSlots['RECESS'], locations['PLAYGROUND'],
            timeSlots['DISPERSAL'],
            rosterTypes['TRANSPORT'], locations['BUS_AREA'],
            rosterTypes['EXAM_DUTY'],
            rosterTypes['STUDENT_LEADERSHIP'],
            locations['LIBRARY'],
            rosterTypes['EVENT']
          ]);
          
          // Seed default config
          await schoolPool.query(`
            INSERT INTO roster_config (school_id) VALUES ($1)
            ON CONFLICT (school_id) DO NOTHING
          `, [schoolId]);
          
          console.log(`  ✓ Seeded default roster data for ${dbName}`);
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
  console.log('\n✓ Roster module migration completed');
  process.exit(0);
}).catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

