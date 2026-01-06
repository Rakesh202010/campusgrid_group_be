import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prismaAdmin from '../lib/prisma.js';
import { getGroupDbClient } from '../lib/groupDb.js';

const JWT_SECRET = process.env.JWT_SECRET || 'school_admin_secret_change_in_production';
const JWT_EXPIRES_IN = '7d';

/**
 * Student Login
 */
export const studentLogin = async (req, res) => {
  try {
    const { email, password, admissionNumber, tenant } = req.body;
    const subdomain = tenant || req.headers['x-subdomain'];

    if ((!email && !admissionNumber) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/Admission number and password are required'
      });
    }

    // Get group by subdomain
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
        }
      });
    }

    if (!targetGroup) {
      // Search all active groups
      const groups = await prismaAdmin.schoolGroup.findMany({
        where: { status: { in: ['Active', 'active'] } },
        select: {
          id: true,
          groupName: true,
          displayName: true,
          subdomain: true,
          dbName: true,
        }
      });

      // Find student in any group
      for (const group of groups) {
        const dbClient = await getGroupDbClient(group.id);
        try {
          let query = `
            SELECT s.*, sc.school_name, sc.school_code, sc.id as school_id,
                   cg.display_name as class_name, sec.name as section_name,
                   acs.name as session_name
            FROM students s
            JOIN schools sc ON s.school_id = sc.id
            LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
            LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
            LEFT JOIN sections sec ON cs.section_id = sec.id
            LEFT JOIN academic_sessions acs ON s.academic_session_id = acs.id
            WHERE s.status = 'active' AND sc.status = 'Active'
          `;
          
          const params = [];
          if (email) {
            query += ` AND s.email = $1`;
            params.push(email);
          } else {
            query += ` AND s.admission_number = $1`;
            params.push(admissionNumber);
          }
          
          const result = await dbClient.query(query, params);
          
          if (result.rows.length > 0) {
            targetGroup = group;
            break;
          }
        } finally {
          await dbClient.end();
        }
      }
    }

    if (!targetGroup) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Get student from database
    const dbClient = await getGroupDbClient(targetGroup.id);
    
    try {
      let query = `
        SELECT s.*, sc.school_name, sc.school_code, sc.id as school_id,
               cg.display_name as class_name, sec.name as section_name,
               acs.name as session_name
        FROM students s
        JOIN schools sc ON s.school_id = sc.id
        LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        LEFT JOIN academic_sessions acs ON s.academic_session_id = acs.id
        WHERE s.status = 'active' AND sc.status = 'Active'
      `;
      
      const params = [];
      if (email) {
        query += ` AND s.email = $1`;
        params.push(email);
      } else {
        query += ` AND s.admission_number = $1`;
        params.push(admissionNumber);
      }
      
      const studentResult = await dbClient.query(query, params);

      if (studentResult.rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      const student = studentResult.rows[0];

      // Verify password
      if (!student.password_hash) {
        return res.status(401).json({
          success: false,
          message: 'Login not enabled for this student. Please contact school administrator.'
        });
      }

      const isPasswordValid = await bcrypt.compare(password, student.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Update last login
      await dbClient.query(
        `UPDATE students SET last_login = NOW() WHERE id = $1`,
        [student.id]
      );

      // Generate JWT token
      const token = jwt.sign(
        {
          user_id: student.id,
          user_type: 'student',
          group_id: targetGroup.id,
          school_id: student.school_id,
          email: student.email,
          tenant: targetGroup.subdomain
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.json({
        success: true,
        message: 'Login successful',
        token,
        userType: 'student',
        user: {
          id: student.id,
          firstName: student.first_name,
          lastName: student.last_name,
          fullName: `${student.first_name} ${student.last_name || ''}`.trim(),
          email: student.email,
          phone: student.phone,
          admissionNumber: student.admission_number,
          rollNumber: student.roll_number,
          photoUrl: student.photo_url,
          className: student.class_name ? `${student.class_name} - ${student.section_name}` : null,
          classSectionId: student.current_class_section_id,
          sessionName: student.session_name
        },
        school: {
          id: student.school_id,
          name: student.school_name,
          code: student.school_code
        },
        groupId: targetGroup.id,
        tenant: targetGroup.subdomain
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Student login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Parent Login
 */
export const parentLogin = async (req, res) => {
  try {
    const { email, phone, password, tenant } = req.body;
    const subdomain = tenant || req.headers['x-subdomain'];

    if ((!email && !phone) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/Phone and password are required'
      });
    }

    // Get all active groups
    const groups = await prismaAdmin.schoolGroup.findMany({
      where: { status: { in: ['Active', 'active'] } },
      select: {
        id: true,
        groupName: true,
        displayName: true,
        subdomain: true,
        dbName: true,
      }
    });

    let parent = null;
    let targetGroup = null;
    let children = [];

    // Search for parent in each group
    for (const group of groups) {
      if (subdomain && group.subdomain !== subdomain) continue;
      
      const dbClient = await getGroupDbClient(group.id);
      try {
        let query = `
          SELECT p.*, sc.school_name, sc.school_code, sc.id as school_id
          FROM parents p
          JOIN schools sc ON p.school_id = sc.id
          WHERE p.is_active = true AND sc.status = 'Active'
        `;
        
        const params = [];
        if (email) {
          query += ` AND p.email = $1`;
          params.push(email);
        } else {
          query += ` AND p.phone = $1`;
          params.push(phone);
        }
        
        const result = await dbClient.query(query, params);
        
        if (result.rows.length > 0) {
          parent = result.rows[0];
          targetGroup = group;

          // Get children for this parent
          const childrenResult = await dbClient.query(`
            SELECT s.id, s.first_name, s.last_name, s.admission_number, s.roll_number,
                   s.photo_url, s.current_class_section_id, 
                   cg.display_name as class_name, sec.name as section_name
            FROM students s
            JOIN student_parents sp ON s.id = sp.student_id
            LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
            LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
            LEFT JOIN sections sec ON cs.section_id = sec.id
            WHERE sp.parent_id = $1 AND s.status = 'active'
          `, [parent.id]);
          
          children = childrenResult.rows;
          break;
        }
      } finally {
        await dbClient.end();
      }
    }

    if (!parent || !targetGroup) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    if (!parent.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'Login not enabled for this account. Please contact school administrator.'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, parent.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    const dbClient = await getGroupDbClient(targetGroup.id);
    try {
      await dbClient.query(
        `UPDATE parents SET last_login = NOW() WHERE id = $1`,
        [parent.id]
      );
    } finally {
      await dbClient.end();
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: parent.id,
        user_type: 'parent',
        group_id: targetGroup.id,
        school_id: parent.school_id,
        email: parent.email,
        tenant: targetGroup.subdomain
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      userType: 'parent',
      user: {
        id: parent.id,
        firstName: parent.first_name,
        lastName: parent.last_name,
        fullName: `${parent.first_name} ${parent.last_name || ''}`.trim(),
        email: parent.email,
        phone: parent.phone,
        relationship: parent.parent_type || parent.relationship,
        photoUrl: parent.photo_url
      },
    children: children.map(c => ({
      id: c.id,
      firstName: c.first_name,
      lastName: c.last_name,
      fullName: `${c.first_name} ${c.last_name || ''}`.trim(),
      admissionNumber: c.admission_number,
      rollNumber: c.roll_number,
      photoUrl: c.photo_url,
      className: c.class_name ? `${c.class_name} - ${c.section_name}` : null,
      classSectionId: c.current_class_section_id
    })),
      school: {
        id: parent.school_id,
        name: parent.school_name,
        code: parent.school_code
      },
      groupId: targetGroup.id,
      tenant: targetGroup.subdomain
    });

  } catch (error) {
    console.error('Parent login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Teacher Login
 */
export const teacherLogin = async (req, res) => {
  try {
    const { email, employeeId, password, tenant } = req.body;
    const subdomain = tenant || req.headers['x-subdomain'];

    if ((!email && !employeeId) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/Employee ID and password are required'
      });
    }

    // Get all active groups
    const groups = await prismaAdmin.schoolGroup.findMany({
      where: { status: { in: ['Active', 'active'] } },
      select: {
        id: true,
        groupName: true,
        displayName: true,
        subdomain: true,
        dbName: true,
      }
    });

    let teacher = null;
    let targetGroup = null;

    // Search for teacher in each group
    for (const group of groups) {
      if (subdomain && group.subdomain !== subdomain) continue;
      
      const dbClient = await getGroupDbClient(group.id);
      try {
        let query = `
          SELECT t.*, sc.school_name, sc.school_code, sc.id as school_id
          FROM teachers t
          JOIN schools sc ON t.school_id = sc.id
          WHERE t.status = 'active' AND t.is_active = true AND sc.status = 'Active'
        `;
        
        const params = [];
        if (email) {
          query += ` AND t.email = $1`;
          params.push(email);
        } else {
          query += ` AND t.employee_id = $1`;
          params.push(employeeId);
        }
        
        const result = await dbClient.query(query, params);
        
        if (result.rows.length > 0) {
          teacher = result.rows[0];
          targetGroup = group;
          break;
        }
      } finally {
        await dbClient.end();
      }
    }

    if (!teacher || !targetGroup) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if login access is enabled
    if (!teacher.has_login_access) {
      return res.status(401).json({
        success: false,
        message: 'Login access not enabled. Please contact school administrator.'
      });
    }

    // Verify password
    if (!teacher.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'Login credentials not set. Please contact school administrator.'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, teacher.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    const dbClient = await getGroupDbClient(targetGroup.id);
    try {
      await dbClient.query(
        `UPDATE teachers SET last_login = NOW() WHERE id = $1`,
        [teacher.id]
      );
    } finally {
      await dbClient.end();
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: teacher.id,
        user_type: 'teacher',
        group_id: targetGroup.id,
        school_id: teacher.school_id,
        email: teacher.email,
        tenant: targetGroup.subdomain
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      userType: 'teacher',
      user: {
        id: teacher.id,
        employeeId: teacher.employee_id,
        firstName: teacher.first_name,
        lastName: teacher.last_name,
        fullName: `${teacher.first_name} ${teacher.last_name || ''}`.trim(),
        email: teacher.email,
        phone: teacher.phone,
        department: teacher.department,
        designation: teacher.designation,
        photoUrl: teacher.profile_photo_url,
        isClassTeacher: teacher.is_class_teacher,
        classTeacherOf: teacher.class_teacher_of,
        canTakeAttendance: teacher.can_take_attendance,
        canManageExams: teacher.can_manage_exams
      },
      school: {
        id: teacher.school_id,
        name: teacher.school_name,
        code: teacher.school_code
      },
      groupId: targetGroup.id,
      tenant: targetGroup.subdomain
    });

  } catch (error) {
    console.error('Teacher login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Staff Login (Non-Teaching Staff)
 */
export const staffLogin = async (req, res) => {
  try {
    const { email, employeeId, password, tenant } = req.body;
    const subdomain = tenant || req.headers['x-subdomain'];

    if ((!email && !employeeId) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/Employee ID and password are required'
      });
    }

    // Get all active groups
    const groups = await prismaAdmin.schoolGroup.findMany({
      where: { status: { in: ['Active', 'active'] } },
      select: {
        id: true,
        groupName: true,
        displayName: true,
        subdomain: true,
        dbName: true,
      }
    });

    let staff = null;
    let targetGroup = null;

    // Search for staff in each group
    for (const group of groups) {
      if (subdomain && group.subdomain !== subdomain) continue;
      
      const dbClient = await getGroupDbClient(group.id);
      try {
        let query = `
          SELECT sm.*, sc.school_name, sc.school_code, sc.id as school_id,
                 ur.name as role_name, ur.permissions as role_permissions
          FROM staff_members sm
          JOIN schools sc ON sm.school_id = sc.id
          LEFT JOIN user_roles ur ON sm.role_id = ur.id
          WHERE sm.status = 'active' AND sm.is_active = true AND sc.status = 'Active'
        `;
        
        const params = [];
        if (email) {
          query += ` AND sm.email = $1`;
          params.push(email);
        } else {
          query += ` AND sm.employee_id = $1`;
          params.push(employeeId);
        }
        
        const result = await dbClient.query(query, params);
        
        if (result.rows.length > 0) {
          staff = result.rows[0];
          targetGroup = group;
          break;
        }
      } finally {
        await dbClient.end();
      }
    }

    if (!staff || !targetGroup) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if login access is enabled
    if (!staff.can_login) {
      return res.status(401).json({
        success: false,
        message: 'Login access not enabled. Please contact school administrator.'
      });
    }

    // Verify password
    if (!staff.password_hash) {
      return res.status(401).json({
        success: false,
        message: 'Login credentials not set. Please contact school administrator.'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, staff.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    const dbClient = await getGroupDbClient(targetGroup.id);
    try {
      await dbClient.query(
        `UPDATE staff_members SET last_login = NOW() WHERE id = $1`,
        [staff.id]
      );
    } finally {
      await dbClient.end();
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        user_id: staff.id,
        user_type: 'staff',
        group_id: targetGroup.id,
        school_id: staff.school_id,
        email: staff.email,
        role_id: staff.role_id,
        tenant: targetGroup.subdomain
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      message: 'Login successful',
      token,
      userType: 'staff',
      user: {
        id: staff.id,
        employeeId: staff.employee_id,
        firstName: staff.first_name,
        lastName: staff.last_name,
        fullName: `${staff.first_name} ${staff.last_name || ''}`.trim(),
        email: staff.email,
        phone: staff.phone,
        department: staff.department,
        designation: staff.designation,
        photoUrl: staff.photo_url,
        roleId: staff.role_id,
        roleName: staff.role_name,
        permissions: staff.role_permissions || {}
      },
      school: {
        id: staff.school_id,
        name: staff.school_name,
        code: staff.school_code
      },
      groupId: targetGroup.id,
      tenant: targetGroup.subdomain
    });

  } catch (error) {
    console.error('Staff login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Get current user info based on token
 */
export const getCurrentUser = async (req, res) => {
  try {
    const { user_id, user_type, group_id, school_id } = req.user;

    const dbClient = await getGroupDbClient(group_id);
    
    try {
      let user = null;
      let additionalData = {};

      switch (user_type) {
        case 'student': {
          const result = await dbClient.query(`
            SELECT s.*, cg.display_name as class_name, sec.name as section_name,
                   acs.name as session_name
            FROM students s
            LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
            LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
            LEFT JOIN sections sec ON cs.section_id = sec.id
            LEFT JOIN academic_sessions acs ON s.academic_session_id = acs.id
            WHERE s.id = $1
          `, [user_id]);
          
          if (result.rows.length > 0) {
            const s = result.rows[0];
            user = {
              id: s.id,
              firstName: s.first_name,
              lastName: s.last_name,
              fullName: `${s.first_name} ${s.last_name || ''}`.trim(),
              email: s.email,
              phone: s.phone,
              admissionNumber: s.admission_number,
              rollNumber: s.roll_number,
              photoUrl: s.photo_url,
              className: s.class_name ? `${s.class_name} - ${s.section_name}` : null,
              classSectionId: s.current_class_section_id,
              sessionName: s.session_name
            };
          }
          break;
        }

        case 'parent': {
          const result = await dbClient.query(
            `SELECT * FROM parents WHERE id = $1`,
            [user_id]
          );
          
          if (result.rows.length > 0) {
            const p = result.rows[0];
            user = {
              id: p.id,
              firstName: p.first_name,
              lastName: p.last_name,
              fullName: `${p.first_name} ${p.last_name || ''}`.trim(),
              email: p.email,
              phone: p.phone,
              relationship: p.parent_type || p.relationship,
              photoUrl: p.photo_url
            };

            // Get children
            const childrenResult = await dbClient.query(`
              SELECT s.id, s.first_name, s.last_name, s.admission_number, s.roll_number,
                     s.photo_url, s.current_class_section_id,
                     cg.display_name as class_name, sec.name as section_name
              FROM students s
              JOIN student_parents sp ON s.id = sp.student_id
              LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
              LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
              LEFT JOIN sections sec ON cs.section_id = sec.id
              WHERE sp.parent_id = $1 AND s.status = 'active'
            `, [user_id]);
            
            additionalData.children = childrenResult.rows.map(c => ({
              id: c.id,
              firstName: c.first_name,
              lastName: c.last_name,
              fullName: `${c.first_name} ${c.last_name || ''}`.trim(),
              admissionNumber: c.admission_number,
              rollNumber: c.roll_number,
              photoUrl: c.photo_url,
              className: c.class_name ? `${c.class_name} - ${c.section_name}` : null,
              classSectionId: c.current_class_section_id
            }));
          }
          break;
        }

        case 'teacher': {
          const result = await dbClient.query(
            `SELECT * FROM teachers WHERE id = $1`,
            [user_id]
          );
          
          if (result.rows.length > 0) {
            const t = result.rows[0];
            user = {
              id: t.id,
              employeeId: t.employee_id,
              firstName: t.first_name,
              lastName: t.last_name,
              fullName: `${t.first_name} ${t.last_name || ''}`.trim(),
              email: t.email,
              phone: t.phone,
              department: t.department,
              designation: t.designation,
              photoUrl: t.profile_photo_url,
              isClassTeacher: t.is_class_teacher,
              classTeacherOf: t.class_teacher_of,
              canTakeAttendance: t.can_take_attendance,
              canManageExams: t.can_manage_exams
            };
          }
          break;
        }

        case 'staff': {
          const result = await dbClient.query(`
            SELECT sm.*, ur.name as role_name, ur.permissions as role_permissions
            FROM staff_members sm
            LEFT JOIN user_roles ur ON sm.role_id = ur.id
            WHERE sm.id = $1
          `, [user_id]);
          
          if (result.rows.length > 0) {
            const sm = result.rows[0];
            user = {
              id: sm.id,
              employeeId: sm.employee_id,
              firstName: sm.first_name,
              lastName: sm.last_name,
              fullName: `${sm.first_name} ${sm.last_name || ''}`.trim(),
              email: sm.email,
              phone: sm.phone,
              department: sm.department,
              designation: sm.designation,
              photoUrl: sm.photo_url,
              roleId: sm.role_id,
              roleName: sm.role_name,
              permissions: sm.role_permissions || {}
            };
          }
          break;
        }
      }

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get school info
      const schoolResult = await dbClient.query(
        `SELECT id, school_name, school_code, logo_url FROM schools WHERE id = $1`,
        [school_id]
      );

      res.json({
        success: true,
        userType: user_type,
        user,
        ...additionalData,
        school: schoolResult.rows[0] ? {
          id: schoolResult.rows[0].id,
          name: schoolResult.rows[0].school_name,
          code: schoolResult.rows[0].school_code,
          logoUrl: schoolResult.rows[0].logo_url
        } : null
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user info',
      error: error.message
    });
  }
};

/**
 * Change password for any user type
 */
export const changePassword = async (req, res) => {
  try {
    const { user_id, user_type, group_id } = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters'
      });
    }

    const dbClient = await getGroupDbClient(group_id);
    
    try {
      let table = '';
      switch (user_type) {
        case 'student': table = 'students'; break;
        case 'parent': table = 'parents'; break;
        case 'teacher': table = 'teachers'; break;
        case 'staff': table = 'staff_members'; break;
        default:
          return res.status(400).json({ success: false, message: 'Invalid user type' });
      }

      const result = await dbClient.query(
        `SELECT password_hash FROM ${table} WHERE id = $1`,
        [user_id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await dbClient.query(
        `UPDATE ${table} SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [hashedPassword, user_id]
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
 * Create login credentials for a student
 */
export const createStudentLogin = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { studentId, password } = req.body;

    if (!studentId || !password) {
      return res.status(400).json({
        success: false,
        message: 'Student ID and password are required'
      });
    }

    const dbClient = await getGroupDbClient(groupId);
    
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await dbClient.query(
        `UPDATE students SET password_hash = $1, can_login = true WHERE id = $2 AND school_id = $3`,
        [hashedPassword, studentId, schoolId]
      );

      res.json({
        success: true,
        message: 'Login credentials created for student'
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create student login error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create login',
      error: error.message
    });
  }
};

/**
 * Create login credentials for a parent
 */
export const createParentLogin = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { parentId, password } = req.body;

    if (!parentId || !password) {
      return res.status(400).json({
        success: false,
        message: 'Parent ID and password are required'
      });
    }

    const dbClient = await getGroupDbClient(groupId);
    
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      
      await dbClient.query(
        `UPDATE parents SET password_hash = $1, can_login = true WHERE id = $2 AND school_id = $3`,
        [hashedPassword, parentId, schoolId]
      );

      res.json({
        success: true,
        message: 'Login credentials created for parent'
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create parent login error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create login',
      error: error.message
    });
  }
};

