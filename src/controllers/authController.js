import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pg from 'pg';
import prismaAdmin from '../lib/prisma.js';

const { Client } = pg;

const JWT_SECRET = process.env.JWT_SECRET || 'campusgrid_secret_key_change_in_production';
const JWT_EXPIRES_IN = '7d';

/**
 * Login endpoint for group admins
 * Now queries group database instead of admin database
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Get all active groups from admin database
    const groups = await prismaAdmin.schoolGroup.findMany({
      where: {
        status: { in: ['Active', 'active'] }
      },
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

    // Search for admin in each group's database
    let admin = null;
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
          password: process.env.DB_SCHOOLS_PASSWORD || 'school123', // Use env password (all DBs on same server)
          database: group.dbName,
        });

        await dbClient.connect();

        // Query group_admins table in this group's database
        const result = await dbClient.query(
          `SELECT id, email, password, name, role, is_active, last_login, created_at
           FROM group_admins WHERE email = $1`,
          [email]
        );

        if (result.rows.length > 0) {
          admin = result.rows[0];
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
        message: 'Account is inactive. Please contact support.'
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

    // Update last login in group database
    const updateClient = new Client({
      host: groupInfo.dbHost || process.env.DB_SCHOOLS_HOST || 'localhost',
      port: parseInt(process.env.DB_SCHOOLS_PORT || 5433),
      user: process.env.DB_SCHOOLS_USER || groupInfo.dbUser || 'school_admin',
      password: process.env.DB_SCHOOLS_PASSWORD || 'school123', // Use env password (all DBs on same server)
      database: groupInfo.dbName,
    });

    await updateClient.connect();
    await updateClient.query(
      `UPDATE group_admins SET last_login = NOW() WHERE id = $1`,
      [admin.id]
    );
    await updateClient.end();

    // Generate JWT token
    const token = jwt.sign(
      {
        adminId: admin.id,
        email: admin.email,
        groupId: groupInfo.id,
        role: admin.role
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Return success response
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
        },
        group: {
          id: groupInfo.id,
          groupName: groupInfo.groupName,
          displayName: groupInfo.displayName,
          subdomain: groupInfo.subdomain,
          dbName: groupInfo.dbName,
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Get current user info
 * Now queries group database instead of admin database
 */
export const me = async (req, res) => {
  try {
    const { adminId, groupId } = req.user; // Set by auth middleware

    // Get group info from admin database
    const group = await prismaAdmin.schoolGroup.findUnique({
      where: { id: groupId },
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

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    // Query admin from group database
    const dbClient = new Client({
      host: group.dbHost || process.env.DB_SCHOOLS_HOST || 'localhost',
      port: parseInt(process.env.DB_SCHOOLS_PORT || 5433),
      user: process.env.DB_SCHOOLS_USER || group.dbUser || 'school_admin',
      password: process.env.DB_SCHOOLS_PASSWORD || 'school123', // Use env password (all DBs on same server)
      database: group.dbName,
    });

    await dbClient.connect();

    const result = await dbClient.query(
      `SELECT id, email, name, role, is_active, last_login, created_at
       FROM group_admins WHERE id = $1`,
      [adminId]
    );

    await dbClient.end();

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    const admin = result.rows[0];

    res.json({
      success: true,
      data: {
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          lastLogin: admin.last_login,
        },
        group: {
          id: group.id,
          groupName: group.groupName,
          displayName: group.displayName,
          subdomain: group.subdomain,
        }
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user info',
      error: error.message
    });
  }
};

/**
 * Logout endpoint (client-side token removal mainly)
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
 * Forgot Password - Request password reset
 * Generates a reset token and stores it in the database
 */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
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

    // Search for admin in each group's database
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
          `SELECT id, email, name FROM group_admins WHERE email = $1`,
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

    // Generate reset token
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
        ALTER TABLE group_admins 
        ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
        ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;
      `);
    } catch (error) {
      // Columns might already exist, ignore
    }

    // Store reset token
    await updateClient.query(
      `UPDATE group_admins 
       SET reset_token = $1, reset_token_expiry = $2, updated_at = NOW()
       WHERE id = $3`,
      [resetToken, tokenExpiry, admin.id]
    );

    await updateClient.end();

    // In production, send email with reset link
    // For now, return the reset token in response (for testing)
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5001'}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

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
 * Reset Password - Reset password using token
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

    // Search for admin with matching token in each group's database
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
            ALTER TABLE group_admins 
            ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
            ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;
          `);
        } catch (error) {
          // Columns might already exist, ignore
        }

        // Find admin with matching token and email
        const result = await dbClient.query(
          `SELECT id, email, reset_token, reset_token_expiry 
           FROM group_admins 
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
      `UPDATE group_admins 
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
 * Reset Password Direct - Reset password with email verification (no token required)
 * Simpler flow without email sending
 */
export const resetPasswordDirect = async (req, res) => {
  try {
    const { email, newPassword } = req.body;

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

    // Search for admin in each group's database
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

        // Find admin by email
        const result = await dbClient.query(
          `SELECT id, email, name, is_active 
           FROM group_admins 
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
        message: 'Account is inactive. Please contact support.'
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
      `UPDATE group_admins 
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

