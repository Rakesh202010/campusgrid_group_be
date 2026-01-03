/**
 * Migration: Add login-related columns to students, parents, teachers, and staff_members tables
 * This enables user login management for all user types
 */

export const up = async (dbClient) => {
  console.log('Running migration: add-user-login-columns');
  
  // Add login columns to students table
  await dbClient.query(`
    ALTER TABLE students ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
    ALTER TABLE students ADD COLUMN IF NOT EXISTS can_login BOOLEAN DEFAULT false;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
  `);
  console.log('Added login columns to students table');

  // Add login columns to parents table
  await dbClient.query(`
    ALTER TABLE parents ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
    ALTER TABLE parents ADD COLUMN IF NOT EXISTS can_login BOOLEAN DEFAULT false;
    ALTER TABLE parents ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
  `);
  console.log('Added login columns to parents table');

  // Add login columns to teachers table (if not exists)
  await dbClient.query(`
    ALTER TABLE teachers ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
    ALTER TABLE teachers ADD COLUMN IF NOT EXISTS has_login_access BOOLEAN DEFAULT false;
    ALTER TABLE teachers ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
  `);
  console.log('Added login columns to teachers table');

  // Add login columns to staff_members table
  await dbClient.query(`
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS can_login BOOLEAN DEFAULT false;
    ALTER TABLE staff_members ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;
  `);
  console.log('Added login columns to staff_members table');

  console.log('Migration add-user-login-columns completed successfully');
};

export const down = async (dbClient) => {
  // Rollback - remove the columns (use with caution)
  console.log('Rolling back migration: add-user-login-columns');
  
  await dbClient.query(`
    ALTER TABLE students DROP COLUMN IF EXISTS password_hash;
    ALTER TABLE students DROP COLUMN IF EXISTS can_login;
    ALTER TABLE students DROP COLUMN IF EXISTS last_login;
  `);

  await dbClient.query(`
    ALTER TABLE parents DROP COLUMN IF EXISTS password_hash;
    ALTER TABLE parents DROP COLUMN IF EXISTS can_login;
    ALTER TABLE parents DROP COLUMN IF EXISTS last_login;
  `);

  await dbClient.query(`
    ALTER TABLE teachers DROP COLUMN IF EXISTS password_hash;
    ALTER TABLE teachers DROP COLUMN IF EXISTS has_login_access;
    ALTER TABLE teachers DROP COLUMN IF EXISTS last_login;
  `);

  await dbClient.query(`
    ALTER TABLE staff_members DROP COLUMN IF EXISTS password_hash;
    ALTER TABLE staff_members DROP COLUMN IF EXISTS can_login;
    ALTER TABLE staff_members DROP COLUMN IF EXISTS last_login;
  `);

  console.log('Rollback add-user-login-columns completed');
};

export default { up, down };

