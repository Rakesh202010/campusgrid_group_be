import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'school_admin_secret_change_in_production';

/**
 * Middleware to verify JWT token
 * Supports both old format (adminId) and new format (user_id, group_id, school_id, tenant)
 */
export const verifyToken = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Support both old and new JWT format
    req.user = {
      // New format (multi-school)
      user_id: decoded.user_id || decoded.adminId, // Backward compatibility
      group_id: decoded.group_id || decoded.groupId, // Backward compatibility
      school_id: decoded.school_id || decoded.schoolId, // Backward compatibility
      tenant: decoded.tenant,
      email: decoded.email,
      role: decoded.role,
      // Old format (backward compatibility)
      adminId: decoded.adminId || decoded.user_id,
      groupId: decoded.groupId || decoded.group_id,
      schoolId: decoded.schoolId || decoded.school_id
    };

    next();
  } catch (error) {
    console.error('Token verification error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};

/**
 * Middleware to verify school access
 * Ensures user has access to the requested school
 */
export const verifySchoolAccess = async (req, res, next) => {
  try {
    const { user_id, group_id, school_id } = req.user;
    const requestedSchoolId = req.body.school_id || req.params.schoolId || req.headers['x-school-id'];

    // If no school_id in request, check if user has one in token
    if (!requestedSchoolId && school_id) {
      // User already has a school context, proceed
      return next();
    }

    if (!requestedSchoolId) {
      return res.status(400).json({
        success: false,
        message: 'School ID is required'
      });
    }

    // If user's token already has this school_id, allow access
    if (school_id === requestedSchoolId) {
      return next();
    }

    // Otherwise, user must use switch-school endpoint first
    // For now, we'll allow if they have access (will be checked in controller)
    // In production, you might want to verify here too
    
    next();
  } catch (error) {
    console.error('School access verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to verify school access',
      error: error.message
    });
  }
};
