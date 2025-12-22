import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import prismaAdmin from '../lib/prisma.js';
import { getGroupDbClient } from '../lib/groupDb.js';

const { Client } = pg;

const JWT_SECRET = process.env.JWT_SECRET || 'school_admin_secret_change_in_production';
const JWT_EXPIRES_IN = '7d';

/**
 * School Admin Login with Multi-School Support
 * Supports subdomain-based tenant identification and returns all schools user can access
 */
export const login = async (req, res) => {
  try {
    const { email, password, tenant } = req.body;
    const subdomain = tenant || req.headers['x-subdomain'] || extractSubdomain(req.headers.host);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Get group by subdomain/tenant if provided, otherwise search all groups
    let targetGroup = null;
    if (subdomain) {
      targetGroup = await prismaAdmin.schoolGroup.findUnique({
        where: { subdomain },
        select: {
          id: true,
          groupName: true,
          displayName: true,
          subdomain: true,
          dbName: true,
          dbHost: true,
          dbUser: true,
          dbPassword: true,
        }
      });

      if (!targetGroup) {
        return res.status(404).json({
          success: false,
          message: `Tenant "${subdomain}" not found`
        });
      }
    }

    // Get groups to search
    const groups = targetGroup 
      ? [targetGroup]
      : await prismaAdmin.schoolGroup.findMany({
          where: { status: { in: ['Active', 'active'] } },
          select: {
            id: true,
            groupName: true,
            displayName: true,
            subdomain: true,
            dbName: true,
            dbHost: true,
            dbUser: true,
            dbPassword: true,
          }
        });

    // Search for school admin in group databases
    let admin = null;
    let groupId = null;
    let groupInfo = null;
    let dbClient = null;

    for (const group of groups) {
      try {
        const dbHost = group.dbHost || process.env.DB_SCHOOLS_HOST || 'localhost';
        const dbPort = parseInt(process.env.DB_SCHOOLS_PORT || 5433);

        dbClient = new Client({
          host: dbHost,
          port: dbPort,
          user: process.env.DB_SCHOOLS_USER || group.dbUser || 'school_admin',
          password: process.env.DB_SCHOOLS_PASSWORD || 'school123',
          database: group.dbName,
        });

        await dbClient.connect();

        // Query school_admins by email
        const adminResult = await dbClient.query(
          `SELECT id, email, password, name, role, is_active, must_change_password, last_login
           FROM school_admins WHERE email = $1`,
          [email]
        );

        if (adminResult.rows.length > 0) {
          admin = adminResult.rows[0];
          groupId = group.id;
          groupInfo = group;
          break;
        }
      } catch (error) {
        console.error(`Error querying group ${group.id}:`, error.message);
      } finally {
        if (dbClient) {
          await dbClient.end();
          dbClient = null;
        }
      }
    }

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if admin is active
    if (!admin.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact your school group administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Get all schools for this user from user_schools table
    const groupDbClient = await getGroupDbClient(groupId);
    let availableSchools = [];
    let primarySchool = null;

    try {
      // First, try to get from user_schools junction table
      // Handle case where user_schools table doesn't exist yet (catch error and fallback)
      let userSchoolsResult = null;
      try {
        userSchoolsResult = await groupDbClient.query(
          `SELECT 
            us.id, us.role, us.is_primary,
            s.id as school_id, s.school_name, s.school_code, s.logo_url, s.status as school_status,
            s.city, s.state
           FROM user_schools us
           INNER JOIN schools s ON us.school_id = s.id
           WHERE us.user_id = $1 AND us.user_type = 'school_admin' AND s.status = 'Active'
           ORDER BY us.is_primary DESC, s.school_name ASC`,
          [admin.id]
        );

        if (userSchoolsResult.rows.length > 0) {
          availableSchools = userSchoolsResult.rows.map(row => ({
            school_id: row.school_id,
            school_name: row.school_name,
            school_code: row.school_code,
            logo_url: row.logo_url,
            role: row.role,
            is_primary: row.is_primary,
            city: row.city,
            state: row.state
          }));
          primarySchool = availableSchools.find(s => s.is_primary) || availableSchools[0];
        }
      } catch (error) {
        // If user_schools table doesn't exist, or query fails, fall back to school_admins
        if (error.message.includes('user_schools') || error.message.includes('does not exist')) {
          console.log('user_schools table not found, falling back to school_admins table');
          // Will use fallback below
        } else {
          throw error; // Re-throw if it's a different error
        }
      }

      // Fallback: Get from school_admins table (backward compatibility)
      // Use this if user_schools table doesn't exist or returned no results
      if (availableSchools.length === 0) {
        const fallbackResult = await groupDbClient.query(
          `SELECT 
            s.id as school_id, s.school_name, s.school_code, s.logo_url, s.status as school_status,
            sa.role, s.city, s.state
           FROM school_admins sa
           INNER JOIN schools s ON sa.school_id = s.id
           WHERE sa.id = $1 AND s.status = 'Active'`,
          [admin.id]
        );

        if (fallbackResult.rows.length > 0) {
          availableSchools = fallbackResult.rows.map(row => ({
            school_id: row.school_id,
            school_name: row.school_name,
            school_code: row.school_code,
            logo_url: row.logo_url,
            role: row.role,
            is_primary: true,
            city: row.city,
            state: row.state
          }));
          primarySchool = availableSchools[0];
        }
      }

      // Update last login
      await groupDbClient.query(
        `UPDATE school_admins SET last_login = NOW() WHERE id = $1`,
        [admin.id]
      );
    } finally {
      await groupDbClient.end();
    }

    if (availableSchools.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No active schools assigned to your account'
      });
    }

    // If only one school, automatically select it
    const selectedSchool = availableSchools.length === 1 ? availableSchools[0] : primarySchool;

    // Generate JWT token with tenant and school context
    const token = jwt.sign(
      {
        user_id: admin.id,
        group_id: groupId,
        school_id: selectedSchool?.school_id || null,
        email: admin.email,
        role: admin.role,
        tenant: groupInfo.subdomain
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      user_id: admin.id,
      group_id: groupId,
      tenant: groupInfo.subdomain,
      available_schools: availableSchools.map(s => ({
        school_id: s.school_id,
        school_name: s.school_name,
        school_code: s.school_code,
        logo_url: s.logo_url,
        role: s.role,
        city: s.city,
        state: s.state
      })),
      ...(selectedSchool && {
        school_id: selectedSchool.school_id,
        school_name: selectedSchool.school_name,
        school_code: selectedSchool.school_code
      }),
      token,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        mustChangePassword: admin.must_change_password
      },
      requiresSchoolSelection: availableSchools.length > 1 && !selectedSchool
    });

  } catch (error) {
    console.error('School admin login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Extract subdomain from host header
 */
function extractSubdomain(host) {
  if (!host) return null;
  const parts = host.split('.');
  if (parts.length >= 3) {
    return parts[0];
  }
  return null;
}

/**
 * Get current school admin info
 * Now queries group database instead of admin database
 */
export const me = async (req, res) => {
  try {
    const { adminId, groupId } = req.user;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Get group DB connection
    const dbClient = await getGroupDbClient(groupId);

    try {
      // Query admin and school from group database
      const result = await dbClient.query(
        `SELECT 
          sa.id, sa.email, sa.name, sa.role, sa.school_id,
          sa.is_active, sa.must_change_password, sa.last_login, sa.created_at,
          s.id as school_id, s.school_name, s.school_code, s.school_type, s.education_board,
          s.logo_url, s.status as school_status, s.city, s.state
         FROM school_admins sa
         INNER JOIN schools s ON sa.school_id = s.id
         WHERE sa.id = $1`,
        [adminId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      const row = result.rows[0];

      res.json({
        success: true,
        data: {
          admin: {
            id: row.id,
            email: row.email,
            name: row.name,
            role: row.role,
            isActive: row.is_active,
            mustChangePassword: row.must_change_password,
            lastLogin: row.last_login,
            createdAt: row.created_at
          },
          school: {
            id: row.school_id,
            schoolName: row.school_name,
            schoolCode: row.school_code,
            schoolType: row.school_type,
            educationBoard: row.education_board,
            logoUrl: row.logo_url,
            status: row.school_status,
            city: row.city,
            state: row.state
          }
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get school admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get admin info',
      error: error.message
    });
  }
};

/**
 * Change password
 * Now updates in group database instead of admin database
 */
export const changePassword = async (req, res) => {
  try {
    const { adminId, groupId } = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters'
      });
    }

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Get group DB connection
    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get admin
      const adminResult = await dbClient.query(
        `SELECT id, password FROM school_admins WHERE id = $1`,
        [adminId]
      );

      if (adminResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      const admin = adminResult.rows[0];

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, admin.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password in group database
      await dbClient.query(
        `UPDATE school_admins 
         SET password = $1, must_change_password = false, updated_at = NOW()
         WHERE id = $2`,
        [hashedPassword, adminId]
      );

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
};

/**
 * Switch School - Switch to a different school within the same group
 * Requires valid JWT and validates user has access to the requested school
 */
export const switchSchool = async (req, res) => {
  try {
    const { user_id, group_id } = req.user; // From JWT middleware
    const { school_id } = req.body;

    if (!school_id) {
      return res.status(400).json({
        success: false,
        message: 'School ID is required'
      });
    }

    if (!group_id) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Get group info to get subdomain/tenant
    const group = await prismaAdmin.schoolGroup.findUnique({
      where: { id: group_id },
      select: {
        id: true,
        subdomain: true,
        displayName: true
      }
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Get group DB connection
    const dbClient = await getGroupDbClient(group_id);

    try {
      // Verify user has access to this school
      // First check user_schools table (handle missing table gracefully)
      let userSchool = null;
      try {
        const userSchoolsResult = await dbClient.query(
          `SELECT us.*, s.school_name, s.school_code, s.logo_url, s.status as school_status, s.city, s.state
           FROM user_schools us
           INNER JOIN schools s ON us.school_id = s.id
           WHERE us.user_id = $1 AND us.user_type = 'school_admin' AND us.school_id = $2 AND s.status = 'Active'`,
          [user_id, school_id]
        );

        if (userSchoolsResult.rows.length > 0) {
          userSchool = userSchoolsResult.rows[0];
        }
      } catch (error) {
        // If user_schools table doesn't exist, fall back to school_admins
        if (error.message.includes('user_schools') || error.message.includes('does not exist')) {
          console.log('user_schools table not found, falling back to school_admins table');
          // Will use fallback below
        } else {
          throw error; // Re-throw if it's a different error
        }
      }

      // Fallback: Check school_admins table (backward compatibility)
      if (!userSchool) {
        const fallbackResult = await dbClient.query(
          `SELECT sa.*, s.school_name, s.school_code, s.logo_url, s.status as school_status, s.city, s.state
           FROM school_admins sa
           INNER JOIN schools s ON sa.school_id = s.id
           WHERE sa.id = $1 AND sa.school_id = $2 AND s.status = 'Active'`,
          [user_id, school_id]
        );

        if (fallbackResult.rows.length > 0) {
          userSchool = {
            role: fallbackResult.rows[0].role,
            school_name: fallbackResult.rows[0].school_name,
            school_code: fallbackResult.rows[0].school_code,
            logo_url: fallbackResult.rows[0].logo_url,
            city: fallbackResult.rows[0].city,
            state: fallbackResult.rows[0].state
          };
        }
      }

      if (!userSchool) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this school'
        });
      }

      // Get admin info
      const adminResult = await dbClient.query(
        `SELECT id, email, name, role FROM school_admins WHERE id = $1`,
        [user_id]
      );

      if (adminResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const admin = adminResult.rows[0];

      // Generate new JWT token with updated school context
      const token = jwt.sign(
        {
          user_id: admin.id,
          group_id: group_id,
          school_id: school_id,
          email: admin.email,
          role: userSchool.role || admin.role,
          tenant: group.subdomain
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.json({
        success: true,
        message: 'School switched successfully',
        user_id: admin.id,
        group_id: group_id,
        school_id: school_id,
        role: userSchool.role || admin.role,
        tenant: group.subdomain,
        token,
        school: {
          id: school_id,
          school_name: userSchool.school_name,
          school_code: userSchool.school_code,
          logo_url: userSchool.logo_url,
          city: userSchool.city,
          state: userSchool.state
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Switch school error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to switch school',
      error: error.message
    });
  }
};

/**
 * Logout
 */
export const logout = async (req, res) => {
  try {
    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
};

/**
 * Forgot Password - Request password reset for school admin
 * Generates a reset token and stores it in the database
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email, tenant } = req.body;
    const subdomain = tenant || req.headers['x-subdomain'] || extractSubdomain(req.headers.host);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Get groups to search
    let groups;
    if (subdomain) {
      const targetGroup = await prismaAdmin.schoolGroup.findUnique({
        where: { subdomain },
        select: {
          id: true,
          dbName: true,
          dbHost: true,
          dbUser: true,
          dbPassword: true,
          subdomain: true
        }
      });

      groups = targetGroup ? [targetGroup] : [];
    } else {
      groups = await prismaAdmin.schoolGroup.findMany({
        where: {
          status: { in: ['Active', 'active'] }
        },
        select: {
          id: true,
          dbName: true,
          dbHost: true,
          dbUser: true,
          dbPassword: true,
          subdomain: true
        }
      });
    }

    // Search for school admin in each group's database
    let admin = null;
    let groupInfo = null;

    for (const group of groups) {
      try {
        const dbHost = group.dbHost || process.env.DB_SCHOOLS_HOST || 'localhost';
        const dbPort = parseInt(process.env.DB_SCHOOLS_PORT || 5433);

        const dbClient = new Client({
          host: dbHost,
          port: dbPort,
          user: process.env.DB_SCHOOLS_USER || group.dbUser || 'school_admin',
          password: process.env.DB_SCHOOLS_PASSWORD || 'school123',
          database: group.dbName,
        });

        await dbClient.connect();

        const result = await dbClient.query(
          `SELECT id, email, name, is_active FROM school_admins WHERE email = $1`,
          [email]
        );

        await dbClient.end();

        if (result.rows.length > 0) {
          admin = result.rows[0];
          groupInfo = group;
          break;
        }
      } catch (error) {
        console.error(`Error querying group ${group.id}:`, error.message);
        continue;
      }
    }

    // Always return success (security: don't reveal if email exists)
    if (!admin) {
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Check if admin is active
    if (!admin.is_active) {
      return res.json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      });
    }

    // Generate reset token
    const crypto = await import('crypto');
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in group database
    const dbHost = groupInfo.dbHost || process.env.DB_SCHOOLS_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_SCHOOLS_PORT || 5433);

    const updateClient = new Client({
      host: dbHost,
      port: dbPort,
      user: process.env.DB_SCHOOLS_USER || groupInfo.dbUser || 'school_admin',
      password: process.env.DB_SCHOOLS_PASSWORD || 'school123',
      database: groupInfo.dbName,
    });

    await updateClient.connect();

    // First, check if reset_token columns exist, if not add them
    try {
      await updateClient.query(`
        ALTER TABLE school_admins 
        ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
        ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;
      `);
    } catch (error) {
      // Columns might already exist, ignore
    }

    // Store reset token
    await updateClient.query(
      `UPDATE school_admins 
       SET reset_token = $1, reset_token_expiry = $2, updated_at = NOW()
       WHERE id = $3`,
      [resetToken, tokenExpiry, admin.id]
    );

    await updateClient.end();

    // In production, send email with reset link
    // For now, return the reset token in response (for testing)
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5002'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

    // TODO: Send email with reset link
    // await sendPasswordResetEmail(email, resetLink);

    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
      // Remove this in production - only for development/testing
      ...(process.env.NODE_ENV === 'development' && {
        resetLink: resetLink,
        token: resetToken // Only for testing
      })
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
      error: error.message
    });
  }
};

/**
 * Reset Password - Reset password using token for school admin
 */
export const resetPassword = async (req, res) => {
  try {
    const { token, email, newPassword } = req.body;

    if (!token || !email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Token, email, and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Get all active groups from admin database
    const groups = await prismaAdmin.schoolGroup.findMany({
      where: {
        status: { in: ['Active', 'active'] }
      },
      select: {
        id: true,
        dbName: true,
        dbHost: true,
        dbUser: true,
        dbPassword: true,
      }
    });

    // Search for school admin with matching token in each group's database
    let admin = null;
    let groupInfo = null;

    for (const group of groups) {
      try {
        const dbHost = group.dbHost || process.env.DB_SCHOOLS_HOST || 'localhost';
        const dbPort = parseInt(process.env.DB_SCHOOLS_PORT || 5433);

        const dbClient = new Client({
          host: dbHost,
          port: dbPort,
          user: process.env.DB_SCHOOLS_USER || group.dbUser || 'school_admin',
          password: process.env.DB_SCHOOLS_PASSWORD || 'school123',
          database: group.dbName,
        });

        await dbClient.connect();

        // Check if reset_token columns exist
        try {
          await dbClient.query(`
            ALTER TABLE school_admins 
            ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;
          `);
        } catch (error) {
          // Columns might already exist, ignore
        }

        // Find school admin with matching token and email
        const result = await dbClient.query(
          `SELECT id, email, reset_token, reset_token_expiry 
           FROM school_admins 
           WHERE email = $1 AND reset_token = $2`,
          [email, token]
        );

        await dbClient.end();

        if (result.rows.length > 0) {
          admin = result.rows[0];
          groupInfo = group;
          break;
        }
      } catch (error) {
        console.error(`Error querying group ${group.id}:`, error.message);
        continue;
      }
    }

    if (!admin) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Check if token is expired
    if (admin.reset_token_expiry && new Date(admin.reset_token_expiry) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Reset token has expired. Please request a new one.'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    const dbHost = groupInfo.dbHost || process.env.DB_SCHOOLS_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_SCHOOLS_PORT || 5433);

    const updateClient = new Client({
      host: dbHost,
      port: dbPort,
      user: process.env.DB_SCHOOLS_USER || groupInfo.dbUser || 'school_admin',
      password: process.env.DB_SCHOOLS_PASSWORD || 'school123',
      database: groupInfo.dbName,
    });

    await updateClient.connect();

    await updateClient.query(
      `UPDATE school_admins 
       SET password = $1, reset_token = NULL, reset_token_expiry = NULL, updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, admin.id]
    );

    await updateClient.end();

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: error.message
    });
  }
};

/**
 * Reset Password Direct - Reset password with email verification (no token required) for school admin
 * Simpler flow without email sending
 */
export const resetPasswordDirect = async (req, res) => {
  try {
    const { email, newPassword, tenant } = req.body;
    const subdomain = tenant || req.headers['x-subdomain'] || extractSubdomain(req.headers.host);

    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email and new password are required'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // Get groups to search
    let groups;
    if (subdomain) {
      const targetGroup = await prismaAdmin.schoolGroup.findUnique({
        where: { subdomain },
        select: {
          id: true,
          dbName: true,
          dbHost: true,
          dbUser: true,
          dbPassword: true,
        }
      });

      groups = targetGroup ? [targetGroup] : [];
    } else {
      groups = await prismaAdmin.schoolGroup.findMany({
        where: {
          status: { in: ['Active', 'active'] }
        },
        select: {
          id: true,
          dbName: true,
          dbHost: true,
          dbUser: true,
          dbPassword: true,
        }
      });
    }

    // Search for school admin in each group's database
    let admin = null;
    let groupInfo = null;

    for (const group of groups) {
      try {
        const dbHost = group.dbHost || process.env.DB_SCHOOLS_HOST || 'localhost';
        const dbPort = parseInt(process.env.DB_SCHOOLS_PORT || 5433);

        const dbClient = new Client({
          host: dbHost,
          port: dbPort,
          user: process.env.DB_SCHOOLS_USER || group.dbUser || 'school_admin',
          password: process.env.DB_SCHOOLS_PASSWORD || 'school123',
          database: group.dbName,
        });

        await dbClient.connect();

        // Find school admin by email
        const result = await dbClient.query(
          `SELECT id, email, name, is_active 
           FROM school_admins 
           WHERE email = $1`,
          [email]
        );

        await dbClient.end();

        if (result.rows.length > 0) {
          admin = result.rows[0];
          groupInfo = group;
          break;
        }
      } catch (error) {
        console.error(`Error querying group ${group.id}:`, error.message);
        continue;
      }
    }

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Email not found. Please check your email address.'
      });
    }

    // Check if admin is active
    if (!admin.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact your school group administrator.'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password in group database
    const dbHost = groupInfo.dbHost || process.env.DB_SCHOOLS_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_SCHOOLS_PORT || 5433);

    const updateClient = new Client({
      host: dbHost,
      port: dbPort,
      user: process.env.DB_SCHOOLS_USER || groupInfo.dbUser || 'school_admin',
      password: process.env.DB_SCHOOLS_PASSWORD || 'school123',
      database: groupInfo.dbName,
    });

    await updateClient.connect();

    await updateClient.query(
      `UPDATE school_admins 
       SET password = $1, reset_token = NULL, reset_token_expiry = NULL, updated_at = NOW()
       WHERE id = $2`,
      [hashedPassword, admin.id]
    );

    await updateClient.end();

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now login with your new password.'
    });

  } catch (error) {
    console.error('Reset password direct error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: error.message
    });
  }
};

/**
 * Get school details
 * Now queries from group database instead of admin database
 */
export const getSchoolDetails = async (req, res) => {
  try {
    const { schoolId, groupId } = req.user;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Get group DB connection
    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get school
      const schoolResult = await dbClient.query(
        `SELECT * FROM schools WHERE id = $1`,
        [schoolId]
      );

      if (schoolResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'School not found'
        });
      }

      const school = schoolResult.rows[0];

      // Get counts
      const [studentsCount, teachersCount, classesCount, adminsCount] = await Promise.all([
        dbClient.query(`SELECT COUNT(*) as count FROM students WHERE school_id = $1`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM teachers WHERE school_id = $1`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM classes WHERE school_id = $1`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM school_admins WHERE school_id = $1`, [schoolId])
      ]);

      // Format response
      const formattedSchool = {
        id: school.id,
        schoolName: school.school_name,
        schoolCode: school.school_code,
        schoolType: school.school_type,
        educationBoard: school.education_board,
        academicLevel: school.academic_level,
        description: school.description,
        logoUrl: school.logo_url,
        addressLine1: school.address_line1,
        addressLine2: school.address_line2,
        city: school.city,
        district: school.district,
        state: school.state,
        country: school.country,
        pincode: school.pincode,
        primaryContactName: school.primary_contact_name,
        primaryContactRole: school.primary_contact_role,
        primaryContactEmail: school.primary_contact_email,
        primaryContactPhone: school.primary_contact_phone,
        alternateContactName: school.alternate_contact_name,
        alternateContactEmail: school.alternate_contact_email,
        alternatePhone: school.alternate_phone,
        academicYearStart: school.academic_year_start,
        academicYearEnd: school.academic_year_end,
        gradesOffered: school.grades_offered,
        sectionsPerGrade: school.sections_per_grade,
        gradingSystem: school.grading_system,
        attendanceType: school.attendance_type,
        subjectsOffered: school.subjects_offered,
        feeStructureType: school.fee_structure_type,
        billingContactEmail: school.billing_contact_email,
        paymentModes: school.payment_modes,
        bankName: school.bank_name,
        accountNumber: school.account_number,
        ifscCode: school.ifsc_code,
        taxId: school.tax_id,
        status: school.status,
        createdAt: school.created_at,
        updatedAt: school.updated_at,
        _count: {
          students: parseInt(studentsCount.rows[0].count) || 0,
          teachers: parseInt(teachersCount.rows[0].count) || 0,
          classes: parseInt(classesCount.rows[0].count) || 0,
          schoolAdmins: parseInt(adminsCount.rows[0].count) || 0
        }
      };

      res.json({
        success: true,
        data: formattedSchool
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get school details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch school details',
      error: error.message
    });
  }
};
