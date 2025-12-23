/**
 * Migration: Class Timing Configuration
 * 
 * Creates tables for managing school timing configuration:
 * - class_timing_templates: Predefined templates (e.g., Regular, Exam, Summer)
 * - class_periods: Individual period definitions
 * - break_periods: Break/lunch definitions
 * - timing_exceptions: Date-specific timing overrides
 */

import { Client } from 'pg';
import prismaAdmin from '../lib/prisma.js';

export const up = async (dbClient) => {
  await dbClient.query(`
    -- Class Timing Templates (Regular Day, Exam Day, Half Day, etc.)
    CREATE TABLE IF NOT EXISTS class_timing_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL,
      name VARCHAR(100) NOT NULL,
      code VARCHAR(50) NOT NULL,
      description TEXT,
      is_default BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      applicable_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5,6], -- 0=Sun, 1=Mon, ..., 6=Sat
      effective_from DATE,
      effective_to DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_by UUID,
      UNIQUE(school_id, code)
    );

    -- Class Periods (Period 1, Period 2, etc.)
    CREATE TABLE IF NOT EXISTS class_periods (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL,
      template_id UUID REFERENCES class_timing_templates(id) ON DELETE CASCADE,
      period_number INTEGER NOT NULL,
      name VARCHAR(100) NOT NULL,
      short_name VARCHAR(20),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      duration_minutes INTEGER GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (end_time - start_time)) / 60) STORED,
      period_type VARCHAR(50) DEFAULT 'regular', -- regular, lab, activity, assembly, sports
      is_active BOOLEAN DEFAULT TRUE,
      order_index INTEGER NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(template_id, period_number)
    );

    -- Break Periods (Short Break, Lunch, etc.)
    CREATE TABLE IF NOT EXISTS break_periods (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL,
      template_id UUID REFERENCES class_timing_templates(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      short_name VARCHAR(20),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      duration_minutes INTEGER GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (end_time - start_time)) / 60) STORED,
      break_type VARCHAR(50) DEFAULT 'short_break', -- short_break, lunch, assembly, prayer
      after_period INTEGER, -- This break comes after which period number
      is_active BOOLEAN DEFAULT TRUE,
      order_index INTEGER NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Timing Exceptions (Special days with different timings)
    CREATE TABLE IF NOT EXISTS timing_exceptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL,
      exception_date DATE NOT NULL,
      template_id UUID REFERENCES class_timing_templates(id) ON DELETE SET NULL,
      exception_type VARCHAR(50) NOT NULL, -- holiday, half_day, exam, event, custom
      reason VARCHAR(255),
      is_no_school BOOLEAN DEFAULT FALSE,
      custom_start_time TIME,
      custom_end_time TIME,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_by UUID,
      UNIQUE(school_id, exception_date)
    );

    -- School General Timing Settings
    CREATE TABLE IF NOT EXISTS school_timing_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL UNIQUE,
      school_start_time TIME DEFAULT '08:00',
      school_end_time TIME DEFAULT '15:00',
      gate_open_time TIME DEFAULT '07:30',
      gate_close_time TIME DEFAULT '09:00',
      default_period_duration INTEGER DEFAULT 45, -- minutes
      default_break_duration INTEGER DEFAULT 15, -- minutes
      default_lunch_duration INTEGER DEFAULT 45, -- minutes
      bell_before_period INTEGER DEFAULT 5, -- ring bell X minutes before
      working_days INTEGER[] DEFAULT ARRAY[1,2,3,4,5,6], -- Mon-Sat
      timezone VARCHAR(50) DEFAULT 'Asia/Kolkata',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_class_periods_template ON class_periods(template_id);
    CREATE INDEX IF NOT EXISTS idx_class_periods_school ON class_periods(school_id);
    CREATE INDEX IF NOT EXISTS idx_break_periods_template ON break_periods(template_id);
    CREATE INDEX IF NOT EXISTS idx_timing_exceptions_date ON timing_exceptions(school_id, exception_date);
    CREATE INDEX IF NOT EXISTS idx_timing_templates_school ON class_timing_templates(school_id);
  `);
};

export const down = async (dbClient) => {
  await dbClient.query(`
    DROP INDEX IF EXISTS idx_timing_templates_school;
    DROP INDEX IF EXISTS idx_timing_exceptions_date;
    DROP INDEX IF EXISTS idx_break_periods_template;
    DROP INDEX IF EXISTS idx_class_periods_school;
    DROP INDEX IF EXISTS idx_class_periods_template;
    
    DROP TABLE IF EXISTS school_timing_settings;
    DROP TABLE IF EXISTS timing_exceptions;
    DROP TABLE IF EXISTS break_periods;
    DROP TABLE IF EXISTS class_periods;
    DROP TABLE IF EXISTS class_timing_templates;
  `);
};

// Run migration on all group databases
async function runMigration() {
  console.log('Starting class timing tables migration...\n');

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
      await up(dbClient);
      console.log(`✓ Successfully migrated ${group.dbName}`);
    } catch (error) {
      console.error(`✗ Error migrating ${group.dbName}:`, error.message);
    } finally {
      await dbClient.end();
    }
  }

  await prismaAdmin.$disconnect();
  console.log('\nMigration complete!');
}

// Run migration if executed directly
runMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

