import pg from 'pg';
import prismaAdmin from '../lib/prisma.js';

const { Client } = pg;

export async function migrateStudentsTables() {
  console.log('Starting students table migration...');
  
  try {
    // Get all school groups
    const schoolGroups = await prismaAdmin.schoolGroup.findMany({
      where: { status: 'active' }
    });

    console.log(`Found ${schoolGroups.length} active school groups`);

    for (const group of schoolGroups) {
      console.log(`Migrating students tables for group: ${group.groupName}`);
      
      const client = new Client({
        host: group.dbHost,
        database: group.dbName,
        user: group.dbUser,
        password: group.dbPassword || 'school123',
        port: 5432
      });

      try {
        await client.connect();

        // Create students table
        await client.query(`
          CREATE TABLE IF NOT EXISTS students (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            academic_session_id UUID REFERENCES academic_sessions(id),
            
            -- Admission Details
            admission_number VARCHAR(50) UNIQUE,
            admission_date DATE,
            admission_class_id UUID REFERENCES class_grades(id),
            
            -- Current Class Assignment
            current_class_section_id UUID REFERENCES class_sections(id),
            roll_number VARCHAR(20),
            
            -- Personal Information
            first_name VARCHAR(100) NOT NULL,
            middle_name VARCHAR(100),
            last_name VARCHAR(100) NOT NULL,
            date_of_birth DATE,
            gender VARCHAR(20) CHECK (gender IN ('male', 'female', 'other')),
            blood_group VARCHAR(10),
            nationality VARCHAR(50) DEFAULT 'Indian',
            religion VARCHAR(50),
            caste VARCHAR(100),
            category VARCHAR(50),
            
            -- Contact Information
            email VARCHAR(255),
            phone VARCHAR(20),
            alternate_phone VARCHAR(20),
            
            -- Address
            address_line1 VARCHAR(255),
            address_line2 VARCHAR(255),
            city VARCHAR(100),
            state VARCHAR(100),
            pincode VARCHAR(20),
            country VARCHAR(100) DEFAULT 'India',
            
            -- Identity Documents
            aadhar_number VARCHAR(20),
            
            -- Medical Information
            medical_conditions TEXT,
            allergies TEXT,
            
            -- Transport
            uses_transport BOOLEAN DEFAULT false,
            transport_route_id UUID,
            pickup_point VARCHAR(255),
            
            -- Previous School
            previous_school_name VARCHAR(255),
            previous_school_address TEXT,
            previous_class VARCHAR(50),
            transfer_certificate_number VARCHAR(100),
            
            -- Status
            status VARCHAR(30) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred', 'passed_out', 'dropped')),
            
            -- Photo
            photo_url TEXT,
            
            -- Timestamps
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by UUID,
            updated_by UUID
          )
        `);
        console.log('  ✓ students table created');

        // Create student_parents table (for parent/guardian information)
        await client.query(`
          CREATE TABLE IF NOT EXISTS student_parents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            
            -- Relationship
            relationship VARCHAR(30) NOT NULL CHECK (relationship IN ('father', 'mother', 'guardian', 'other')),
            is_primary_contact BOOLEAN DEFAULT false,
            
            -- Personal Details
            first_name VARCHAR(100) NOT NULL,
            last_name VARCHAR(100),
            occupation VARCHAR(100),
            qualification VARCHAR(100),
            annual_income DECIMAL(15, 2),
            
            -- Contact
            email VARCHAR(255),
            phone VARCHAR(20) NOT NULL,
            alternate_phone VARCHAR(20),
            
            -- Address (if different from student)
            same_as_student_address BOOLEAN DEFAULT true,
            address_line1 VARCHAR(255),
            address_line2 VARCHAR(255),
            city VARCHAR(100),
            state VARCHAR(100),
            pincode VARCHAR(20),
            
            -- Work Details
            office_name VARCHAR(255),
            office_address TEXT,
            office_phone VARCHAR(20),
            
            -- Identity
            aadhar_number VARCHAR(20),
            
            -- Timestamps
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log('  ✓ student_parents table created');

        // Create student_documents table
        await client.query(`
          CREATE TABLE IF NOT EXISTS student_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            
            document_type VARCHAR(100) NOT NULL,
            document_name VARCHAR(255),
            file_url TEXT NOT NULL,
            file_size INTEGER,
            mime_type VARCHAR(100),
            
            verified BOOLEAN DEFAULT false,
            verified_by UUID,
            verified_at TIMESTAMP,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log('  ✓ student_documents table created');

        // Create student_class_history table (to track class changes)
        await client.query(`
          CREATE TABLE IF NOT EXISTS student_class_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
            academic_session_id UUID REFERENCES academic_sessions(id),
            class_section_id UUID REFERENCES class_sections(id),
            roll_number VARCHAR(20),
            
            start_date DATE,
            end_date DATE,
            reason VARCHAR(100),
            remarks TEXT,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by UUID
          )
        `);
        console.log('  ✓ student_class_history table created');

        // Create indexes
        await client.query(`
          CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
          CREATE INDEX IF NOT EXISTS idx_students_academic_session ON students(academic_session_id);
          CREATE INDEX IF NOT EXISTS idx_students_class_section ON students(current_class_section_id);
          CREATE INDEX IF NOT EXISTS idx_students_admission_number ON students(admission_number);
          CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
          CREATE INDEX IF NOT EXISTS idx_students_name ON students(first_name, last_name);
          CREATE INDEX IF NOT EXISTS idx_student_parents_student ON student_parents(student_id);
          CREATE INDEX IF NOT EXISTS idx_student_documents_student ON student_documents(student_id);
          CREATE INDEX IF NOT EXISTS idx_student_class_history_student ON student_class_history(student_id);
        `);
        console.log('  ✓ Indexes created');

        console.log(`✅ Students tables migrated for group: ${group.groupName}`);
      } catch (error) {
        console.error(`Error migrating students tables for ${group.groupName}:`, error.message);
      } finally {
        await client.end();
      }
    }

    console.log('✅ Students table migration completed!');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (process.argv[1].includes('add_students_table')) {
  migrateStudentsTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

