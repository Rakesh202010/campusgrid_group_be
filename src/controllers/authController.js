import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prismaAdmin from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET || 'campusgrid_secret_key_change_in_production';
const JWT_EXPIRES_IN = '7d';

/**
 * Login endpoint for group admins
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

    // Find admin by email
    const admin = await prismaAdmin.groupAdmin.findUnique({
      where: { email },
      include: {
        group: true
      }
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if admin is active
    if (!admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is inactive. Please contact support.'
      });
    }

    // Check if group is active
    if (admin.group.status !== 'Active' && admin.group.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Your group account is not active. Please contact support.'
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

    // Update last login
    await prismaAdmin.groupAdmin.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() }
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        adminId: admin.id,
        email: admin.email,
        groupId: admin.groupId,
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
          id: admin.group.id,
          groupName: admin.group.groupName,
          displayName: admin.group.displayName,
          subdomain: admin.group.subdomain,
          dbName: admin.group.dbName,
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
 */
export const me = async (req, res) => {
  try {
    const { adminId } = req.user; // Set by auth middleware

    const admin = await prismaAdmin.groupAdmin.findUnique({
      where: { id: adminId },
      include: {
        group: true
      }
    });

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    res.json({
      success: true,
      data: {
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          role: admin.role,
          lastLogin: admin.lastLogin,
        },
        group: {
          id: admin.group.id,
          groupName: admin.group.groupName,
          displayName: admin.group.displayName,
          subdomain: admin.group.subdomain,
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

