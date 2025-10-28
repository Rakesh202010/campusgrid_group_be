import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import pg from 'pg';
import { validateSchoolGroup } from '../validators/schoolGroup.js';

const prisma = new PrismaClient();
const { Client } = pg;

/**
 * Onboard a new school group and create its database
 */
export const onboardSchoolGroup = async (req, res) => {
  try {
    const data = req.body;
    
    // Check if subdomain already exists
    const existingGroup = await prisma.schoolGroup.findUnique({
      where: { subdomain: data.subdomain }
    });
    
    if (existingGroup) {
      return res.status(400).json({
        success: false,
        message: `Subdomain "${data.subdomain}" already exists`,
      });
    }
    
    // Generate database credentials
    const dbName = `school_${data.subdomain.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const dbPassword = generatePassword();
    
    // Create database for the school group
    await createSchoolDatabase(dbName, dbPassword);
    
    // Create school group record in admin database
    const schoolGroup = await prisma.schoolGroup.create({
      data: {
        ...data,
        dbName,
        dbHost: process.env.DB_SCHOOLS_HOST || 'localhost',
        dbUser: process.env.DB_SCHOOLS_USER || 'school_admin',
        dbPassword,
      }
    });
    
    res.status(201).json({
      success: true,
      message: 'School group onboarded successfully',
      data: {
        id: schoolGroup.id,
        groupName: schoolGroup.groupName,
        displayName: schoolGroup.displayName,
        subdomain: schoolGroup.subdomain,
        dbName: schoolGroup.dbName,
        status: schoolGroup.status,
        connectionString: `postgresql://${schoolGroup.dbUser}:${schoolGroup.dbPassword}@${schoolGroup.dbHost}:${process.env.DB_SCHOOLS_PORT || 5433}/${schoolGroup.dbName}`,
        createdAt: schoolGroup.createdAt,
      }
    });
    
  } catch (error) {
    console.error('Error onboarding school group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to onboard school group',
      error: error.message,
    });
  }
};

/**
 * Get all school groups
 */
export const getAllSchoolGroups = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    
    const where = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { groupName: { contains: search, mode: 'insensitive' } },
        { displayName: { contains: search, mode: 'insensitive' } },
        { contactEmail: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    const [groups, total] = await Promise.all([
      prisma.schoolGroup.findMany({
        where,
        skip: (page - 1) * limit,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          groupName: true,
          displayName: true,
          organizationType: true,
          subdomain: true,
          contactEmail: true,
          contactPhone: true,
          state: true,
          city: true,
          status: true,
          planType: true,
          createdAt: true,
          updatedAt: true,
        }
      }),
      prisma.schoolGroup.count({ where })
    ]);
    
    res.json({
      success: true,
      data: groups,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      }
    });
    
  } catch (error) {
    console.error('Error fetching school groups:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch school groups',
      error: error.message,
    });
  }
};

/**
 * Get a specific school group by ID
 */
export const getSchoolGroupById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const group = await prisma.schoolGroup.findUnique({
      where: { id }
    });
    
    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'School group not found',
      });
    }
    
    // Don't expose sensitive data
    const { dbPassword, ...groupData } = group;
    
    res.json({
      success: true,
      data: groupData,
    });
    
  } catch (error) {
    console.error('Error fetching school group:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch school group',
      error: error.message,
    });
  }
};

/**
 * Create a new PostgreSQL database for a school group
 */
async function createSchoolDatabase(dbName, dbPassword) {
  const client = new Client({
    host: process.env.DB_SCHOOLS_HOST || 'localhost',
    port: process.env.DB_SCHOOLS_PORT || 5433,
    user: process.env.DB_SCHOOLS_USER || 'school_admin',
    password: process.env.DB_SCHOOLS_PASSWORD || 'school123',
    database: 'postgres', // Connect to default postgres database
  });
  
  try {
    await client.connect();
    
    // Create database
    await client.query(`CREATE DATABASE ${dbName};`);
    
    // Connect to the new database
    const dbClient = new Client({
      host: process.env.DB_SCHOOLS_HOST || 'localhost',
      port: process.env.DB_SCHOOLS_PORT || 5433,
      user: process.env.DB_SCHOOLS_USER || 'school_admin',
      password: process.env.DB_SCHOOLS_PASSWORD || 'school123',
      database: dbName,
    });
    
    await dbClient.connect();
    
    // Create extensions
    await dbClient.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    
    // Create schema (students, teachers, courses tables)
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS students (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        class VARCHAR(50),
        roll_number VARCHAR(50),
        date_of_birth DATE,
        address TEXT,
        parent_name VARCHAR(255),
        parent_phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS teachers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(50),
        subject VARCHAR(255),
        employee_id VARCHAR(100) UNIQUE,
        experience_years INTEGER,
        qualification VARCHAR(255),
        joining_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS courses (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        credits INTEGER DEFAULT 0,
        teacher_id UUID REFERENCES teachers(id),
        duration_hours INTEGER,
        fee DECIMAL(10, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS classes (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(50) NOT NULL,
        section VARCHAR(10),
        academic_year VARCHAR(20),
        teacher_id UUID REFERENCES teachers(id),
        room_number VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Create indexes for performance
    await dbClient.query(`
      CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);
      CREATE INDEX IF NOT EXISTS idx_students_roll_number ON students(roll_number);
      CREATE INDEX IF NOT EXISTS idx_teachers_email ON teachers(email);
      CREATE INDEX IF NOT EXISTS idx_teachers_employee_id ON teachers(employee_id);
      CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(code);
      CREATE INDEX IF NOT EXISTS idx_classes_academic_year ON classes(academic_year);
    `);
    
    // Grant permissions
    await dbClient.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${process.env.DB_SCHOOLS_USER || 'school_admin'};`);
    await dbClient.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${process.env.DB_SCHOOLS_USER || 'school_admin'};`);
    
    await dbClient.end();
    await client.end();
    
    console.log(`✅ Database ${dbName} created successfully`);
    
  } catch (error) {
    await client.end();
    console.error(`❌ Error creating database ${dbName}:`, error.message);
    throw error;
  }
}

/**
 * Generate a secure random password
 */
function generatePassword() {
  return `CG${uuidv4().replace(/-/g, '').substring(0, 14)}!`;
}
