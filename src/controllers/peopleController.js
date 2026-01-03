import { getGroupDbClient } from '../lib/groupDb.js';

// =====================================================
// USER ROLES CRUD
// =====================================================

export const getUserRoles = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { is_active, is_system } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `SELECT * FROM user_roles WHERE school_id = $1`;
      const params = [schoolId];
      let paramIndex = 2;

      if (is_active !== undefined) {
        query += ` AND is_active = $${paramIndex}`;
        params.push(is_active === 'true');
        paramIndex++;
      }

      if (is_system !== undefined) {
        query += ` AND is_system = $${paramIndex}`;
        params.push(is_system === 'true');
      }

      query += ` ORDER BY order_index ASC, name ASC`;

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          code: row.code,
          description: row.description,
          permissions: row.permissions,
          isSystem: row.is_system,
          isActive: row.is_active,
          orderIndex: row.order_index,
          createdAt: row.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get user roles error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user roles', error: error.message });
  }
};

export const createUserRole = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { name, code, description, permissions, orderIndex } = req.body;

    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Name and code are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const existing = await dbClient.query(
        `SELECT id FROM user_roles WHERE school_id = $1 AND code = $2`,
        [schoolId, code]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'A role with this code already exists' });
      }

      const result = await dbClient.query(
        `INSERT INTO user_roles (school_id, name, code, description, permissions, order_index, is_system)
         VALUES ($1, $2, $3, $4, $5, $6, false)
         RETURNING *`,
        [schoolId, name, code.toUpperCase(), description, JSON.stringify(permissions || []), orderIndex || 0]
      );

      res.status(201).json({
        success: true,
        message: 'User role created successfully',
        data: result.rows[0]
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create user role error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user role', error: error.message });
  }
};

export const updateUserRole = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { name, description, permissions, isActive, orderIndex } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if it's a system role
      const existing = await dbClient.query(
        `SELECT is_system FROM user_roles WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User role not found' });
      }

      const result = await dbClient.query(
        `UPDATE user_roles SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          permissions = COALESCE($3, permissions),
          is_active = COALESCE($4, is_active),
          order_index = COALESCE($5, order_index),
          updated_at = NOW()
        WHERE id = $6 AND school_id = $7
        RETURNING *`,
        [name, description, permissions ? JSON.stringify(permissions) : null, isActive, orderIndex, id, schoolId]
      );

      res.json({ success: true, message: 'User role updated successfully', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user role', error: error.message });
  }
};

export const deleteUserRole = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if it's a system role
      const existing = await dbClient.query(
        `SELECT is_system FROM user_roles WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User role not found' });
      }

      if (existing.rows[0].is_system) {
        return res.status(400).json({ success: false, message: 'Cannot delete system roles' });
      }

      await dbClient.query(
        `DELETE FROM user_roles WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      res.json({ success: true, message: 'User role deleted successfully' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete user role error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user role', error: error.message });
  }
};


// =====================================================
// STAFF MEMBERS CRUD
// =====================================================

export const getStaffMembers = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { role_id, status, department } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT sm.*, ur.name as role_name, ur.code as role_code
        FROM staff_members sm
        LEFT JOIN user_roles ur ON sm.role_id = ur.id
        WHERE sm.school_id = $1
      `;
      const params = [schoolId];
      let paramIndex = 2;

      if (role_id) {
        query += ` AND sm.role_id = $${paramIndex}`;
        params.push(role_id);
        paramIndex++;
      }

      if (status) {
        query += ` AND sm.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (department) {
        query += ` AND sm.department = $${paramIndex}`;
        params.push(department);
      }

      query += ` ORDER BY sm.first_name ASC`;

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          employeeId: row.employee_id,
          firstName: row.first_name,
          lastName: row.last_name,
          fullName: `${row.first_name} ${row.last_name || ''}`.trim(),
          email: row.email,
          phone: row.phone,
          roleId: row.role_id,
          roleName: row.role_name,
          roleCode: row.role_code,
          department: row.department,
          designation: row.designation,
          dateOfJoining: row.date_of_joining,
          dateOfBirth: row.date_of_birth,
          gender: row.gender,
          address: row.address,
          city: row.city,
          state: row.state,
          pincode: row.pincode,
          profilePhotoUrl: row.profile_photo_url,
          salary: row.salary ? parseFloat(row.salary) : null,
          isActive: row.is_active,
          status: row.status,
          createdAt: row.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get staff members error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch staff members', error: error.message });
  }
};

export const createStaffMember = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const {
      employeeId, firstName, lastName, email, phone, roleId, department, departmentId, designation,
      dateOfJoining, joiningDate, dateOfBirth, gender, address, city, state, pincode,
      emergencyContactName, emergencyContactPhone, bloodGroup, salary, status
    } = req.body;

    if (!firstName) {
      return res.status(400).json({ success: false, message: 'First name is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for duplicate employee ID
      if (employeeId) {
        const existing = await dbClient.query(
          `SELECT id FROM staff_members WHERE school_id = $1 AND employee_id = $2`,
          [schoolId, employeeId]
        );
        if (existing.rows.length > 0) {
          return res.status(400).json({ success: false, message: 'Employee ID already exists' });
        }
      }

      // Handle empty strings for UUID fields - convert to null
      const cleanRoleId = roleId && roleId.trim() !== '' && !roleId.startsWith('default-') ? roleId : null;
      
      // Department is a string field, not UUID - handle default-X IDs from frontend
      let deptValue = null;
      if (departmentId && departmentId.trim() !== '') {
        // If it's a default-X ID, extract the department name from the mapping
        if (departmentId.startsWith('default-')) {
          const defaultDepts = {
            'default-1': 'Administration',
            'default-2': 'Accounts & Finance', 
            'default-3': 'Human Resources',
            'default-4': 'IT & Technology',
            'default-5': 'Security',
            'default-6': 'Housekeeping',
            'default-7': 'Transport',
            'default-8': 'Library',
            'default-9': 'Laboratory',
            'default-10': 'Sports & PE',
            'default-11': 'Medical/Health',
            'default-12': 'Canteen',
            'default-13': 'Reception/Front Office'
          };
          deptValue = defaultDepts[departmentId] || departmentId;
        } else {
          deptValue = departmentId;
        }
      } else if (department && department.trim() !== '') {
        deptValue = department;
      }
      
      // Use joiningDate if dateOfJoining is not provided
      const joinDate = dateOfJoining || joiningDate || null;

      const result = await dbClient.query(
        `INSERT INTO staff_members (
          school_id, employee_id, first_name, last_name, email, phone, role_id,
          department, designation, date_of_joining, date_of_birth, gender,
          address, city, state, pincode, emergency_contact_name, emergency_contact_phone,
          blood_group, salary, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING *`,
        [
          schoolId, employeeId || null, firstName, lastName || null, email || null, phone || null, cleanRoleId,
          deptValue, designation || null, joinDate, dateOfBirth || null, gender || null,
          address || null, city || null, state || null, pincode || null, emergencyContactName || null, emergencyContactPhone || null,
          bloodGroup || null, salary || null, status || 'active'
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Staff member added successfully',
        data: {
          id: result.rows[0].id,
          employeeId: result.rows[0].employee_id,
          firstName: result.rows[0].first_name,
          lastName: result.rows[0].last_name,
          email: result.rows[0].email,
          phone: result.rows[0].phone,
          roleId: result.rows[0].role_id,
          department: result.rows[0].department,
          departmentId: result.rows[0].department,
          designation: result.rows[0].designation,
          joiningDate: result.rows[0].date_of_joining,
          status: result.rows[0].status,
          createdAt: result.rows[0].created_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create staff member error:', error);
    res.status(500).json({ success: false, message: 'Failed to add staff member', error: error.message });
  }
};

export const updateStaffMember = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Handle empty strings for UUID fields - convert to null
      const cleanRoleId = updates.roleId && updates.roleId.trim() !== '' && !updates.roleId.startsWith('default-') ? updates.roleId : null;
      
      // Department is a string field, not UUID - handle default-X IDs from frontend
      let deptValue = null;
      if (updates.departmentId && updates.departmentId.trim() !== '') {
        if (updates.departmentId.startsWith('default-')) {
          const defaultDepts = {
            'default-1': 'Administration',
            'default-2': 'Accounts & Finance', 
            'default-3': 'Human Resources',
            'default-4': 'IT & Technology',
            'default-5': 'Security',
            'default-6': 'Housekeeping',
            'default-7': 'Transport',
            'default-8': 'Library',
            'default-9': 'Laboratory',
            'default-10': 'Sports & PE',
            'default-11': 'Medical/Health',
            'default-12': 'Canteen',
            'default-13': 'Reception/Front Office'
          };
          deptValue = defaultDepts[updates.departmentId] || updates.departmentId;
        } else {
          deptValue = updates.departmentId;
        }
      } else if (updates.department && updates.department.trim() !== '') {
        deptValue = updates.department;
      }
      
      // Use joiningDate if dateOfJoining is not provided
      const joinDate = updates.dateOfJoining || updates.joiningDate || null;

      const result = await dbClient.query(
        `UPDATE staff_members SET
          first_name = COALESCE($1, first_name),
          last_name = COALESCE($2, last_name),
          email = COALESCE($3, email),
          phone = COALESCE($4, phone),
          role_id = $5,
          department = COALESCE($6, department),
          designation = COALESCE($7, designation),
          date_of_joining = COALESCE($8, date_of_joining),
          date_of_birth = COALESCE($9, date_of_birth),
          gender = COALESCE($10, gender),
          address = COALESCE($11, address),
          city = COALESCE($12, city),
          state = COALESCE($13, state),
          pincode = COALESCE($14, pincode),
          salary = COALESCE($15, salary),
          is_active = COALESCE($16, is_active),
          status = COALESCE($17, status),
          updated_at = NOW()
        WHERE id = $18 AND school_id = $19
        RETURNING *`,
        [
          updates.firstName || null, updates.lastName || null, updates.email || null, updates.phone || null,
          cleanRoleId, deptValue, updates.designation || null,
          joinDate, updates.dateOfBirth || null, updates.gender || null,
          updates.address || null, updates.city || null, updates.state || null, updates.pincode || null,
          updates.salary || null, updates.isActive, updates.status || null, id, schoolId
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Staff member not found' });
      }

      res.json({ 
        success: true, 
        message: 'Staff member updated successfully', 
        data: {
          id: result.rows[0].id,
          employeeId: result.rows[0].employee_id,
          firstName: result.rows[0].first_name,
          lastName: result.rows[0].last_name,
          email: result.rows[0].email,
          phone: result.rows[0].phone,
          roleId: result.rows[0].role_id,
          department: result.rows[0].department,
          departmentId: result.rows[0].department,
          designation: result.rows[0].designation,
          joiningDate: result.rows[0].date_of_joining,
          status: result.rows[0].status,
          createdAt: result.rows[0].created_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update staff member error:', error);
    res.status(500).json({ success: false, message: 'Failed to update staff member', error: error.message });
  }
};

export const deleteStaffMember = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM staff_members WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Staff member not found' });
      }

      res.json({ success: true, message: 'Staff member deleted successfully' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete staff member error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete staff member', error: error.message });
  }
};


// =====================================================
// PARENTS CRUD
// =====================================================

export const getParents = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { parent_type, is_active, include_students, academic_session_id } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // If academic_session_id is provided, only get parents linked to students in that session
      let query;
      const params = [schoolId];
      let paramIndex = 2;

      if (academic_session_id) {
        // Get parents who have students in the specified academic session
        query = `
          SELECT DISTINCT p.* 
          FROM parents p
          INNER JOIN student_parents sp ON p.id = sp.parent_id
          INNER JOIN students s ON sp.student_id = s.id
          WHERE p.school_id = $1 AND s.academic_session_id = $${paramIndex}
        `;
        params.push(academic_session_id);
        paramIndex++;
      } else {
        query = `SELECT * FROM parents WHERE school_id = $1`;
      }

      if (parent_type) {
        query += ` AND p.parent_type = $${paramIndex}`;
        params.push(parent_type);
        paramIndex++;
      }

      if (is_active !== undefined) {
        query += ` AND ${academic_session_id ? 'p.' : ''}is_active = $${paramIndex}`;
        params.push(is_active === 'true');
      }

      query += ` ORDER BY ${academic_session_id ? 'p.' : ''}first_name ASC`;

      const result = await dbClient.query(query, params);

      // Get linked students for each parent if requested
      let parentStudentsMap = {};
      if (include_students === 'true' && result.rows.length > 0) {
        const parentIds = result.rows.map(r => r.id);
        
        // Build query with optional academic session filter
        let studentsQuery = `
          SELECT sp.parent_id, sp.relationship, sp.is_primary, sp.is_guardian,
                 s.id as student_id, s.first_name, s.last_name, s.admission_number, s.roll_number,
                 s.photo_url, s.status,
                 cg.display_name as class_name, sec.name as section_name
          FROM student_parents sp
          JOIN students s ON sp.student_id = s.id
          LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
          LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
          LEFT JOIN sections sec ON cs.section_id = sec.id
          WHERE sp.parent_id = ANY($1) AND s.status = 'active'
        `;
        const studentsParams = [parentIds];
        
        if (academic_session_id) {
          studentsQuery += ` AND s.academic_session_id = $2`;
          studentsParams.push(academic_session_id);
        }
        
        studentsQuery += ` ORDER BY s.first_name ASC`;
        
        const studentsResult = await dbClient.query(studentsQuery, studentsParams);

        // Group students by parent_id
        studentsResult.rows.forEach(row => {
          if (!parentStudentsMap[row.parent_id]) {
            parentStudentsMap[row.parent_id] = [];
          }
          parentStudentsMap[row.parent_id].push({
            id: row.student_id,
            firstName: row.first_name,
            lastName: row.last_name,
            fullName: `${row.first_name} ${row.last_name || ''}`.trim(),
            admissionNumber: row.admission_number,
            rollNumber: row.roll_number,
            photoUrl: row.photo_url,
            status: row.status,
            className: row.class_name ? `${row.class_name}${row.section_name ? ' - ' + row.section_name : ''}` : null,
            relationship: row.relationship,
            isPrimary: row.is_primary,
            isGuardian: row.is_guardian
          });
        });
      }

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          parentType: row.parent_type,
          relationship: row.parent_type,
          firstName: row.first_name,
          lastName: row.last_name,
          fullName: `${row.first_name} ${row.last_name || ''}`.trim(),
          email: row.email,
          phone: row.phone,
          alternatePhone: row.alternate_phone,
          occupation: row.occupation,
          annualIncome: row.annual_income,
          education: row.education,
          address: row.address,
          city: row.city,
          state: row.state,
          pincode: row.pincode,
          relationWithStudent: row.relation_with_student,
          canPickup: row.can_pickup,
          isEmergencyContact: row.is_emergency_contact,
          profilePhotoUrl: row.profile_photo_url,
          isActive: row.is_active,
          hasLoginAccess: row.can_login,
          canLogin: row.can_login,
          createdAt: row.created_at,
          // Include linked students if requested
          students: parentStudentsMap[row.id] || []
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get parents error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch parents', error: error.message });
  }
};

export const createParent = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const {
      parentType, firstName, lastName, email, phone, alternatePhone,
      occupation, annualIncome, education, address, city, state, pincode,
      relationWithStudent, canPickup, isEmergencyContact
    } = req.body;

    if (!firstName) {
      return res.status(400).json({ success: false, message: 'First name is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `INSERT INTO parents (
          school_id, parent_type, first_name, last_name, email, phone, alternate_phone,
          occupation, annual_income, education, address, city, state, pincode,
          relation_with_student, can_pickup, is_emergency_contact
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *`,
        [
          schoolId, parentType || 'father', firstName, lastName, email, phone, alternatePhone,
          occupation, annualIncome, education, address, city, state, pincode,
          relationWithStudent, canPickup !== false, isEmergencyContact || false
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Parent added successfully',
        data: result.rows[0]
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create parent error:', error);
    res.status(500).json({ success: false, message: 'Failed to add parent', error: error.message });
  }
};

export const updateParent = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `UPDATE parents SET
          parent_type = COALESCE($1, parent_type),
          first_name = COALESCE($2, first_name),
          last_name = COALESCE($3, last_name),
          email = COALESCE($4, email),
          phone = COALESCE($5, phone),
          alternate_phone = COALESCE($6, alternate_phone),
          occupation = COALESCE($7, occupation),
          annual_income = COALESCE($8, annual_income),
          education = COALESCE($9, education),
          address = COALESCE($10, address),
          city = COALESCE($11, city),
          state = COALESCE($12, state),
          pincode = COALESCE($13, pincode),
          can_pickup = COALESCE($14, can_pickup),
          is_emergency_contact = COALESCE($15, is_emergency_contact),
          is_active = COALESCE($16, is_active),
          updated_at = NOW()
        WHERE id = $17 AND school_id = $18
        RETURNING *`,
        [
          updates.parentType, updates.firstName, updates.lastName, updates.email,
          updates.phone, updates.alternatePhone, updates.occupation, updates.annualIncome,
          updates.education, updates.address, updates.city, updates.state, updates.pincode,
          updates.canPickup, updates.isEmergencyContact, updates.isActive, id, schoolId
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Parent not found' });
      }

      res.json({ success: true, message: 'Parent updated successfully', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update parent error:', error);
    res.status(500).json({ success: false, message: 'Failed to update parent', error: error.message });
  }
};

export const deleteParent = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM parents WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Parent not found' });
      }

      res.json({ success: true, message: 'Parent deleted successfully' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete parent error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete parent', error: error.message });
  }
};


// =====================================================
// STAFF LOGIN ACCESS MANAGEMENT
// =====================================================

export const updateStaffAccess = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { canLogin, password, roleId } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Build update query dynamically
      let updates = [];
      let params = [];
      let paramIndex = 1;

      if (canLogin !== undefined) {
        updates.push(`can_login = $${paramIndex}`);
        params.push(canLogin);
        paramIndex++;
      }

      if (password) {
        const bcrypt = await import('bcryptjs');
        const hashedPassword = await bcrypt.hash(password, 10);
        updates.push(`password_hash = $${paramIndex}`);
        params.push(hashedPassword);
        paramIndex++;
      }

      if (roleId !== undefined) {
        updates.push(`role_id = $${paramIndex}`);
        params.push(roleId || null);
        paramIndex++;
      }

      updates.push(`updated_at = NOW()`);

      params.push(id, schoolId);

      const result = await dbClient.query(
        `UPDATE staff_members SET ${updates.join(', ')} WHERE id = $${paramIndex} AND school_id = $${paramIndex + 1} RETURNING *`,
        params
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Staff member not found' });
      }

      res.json({ 
        success: true, 
        message: canLogin ? 'Login enabled successfully' : 'Access updated successfully',
        data: {
          id: result.rows[0].id,
          canLogin: result.rows[0].can_login,
          hasPassword: !!result.rows[0].password_hash
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update staff access error:', error);
    res.status(500).json({ success: false, message: 'Failed to update staff access', error: error.message });
  }
};

export const toggleStaffLogin = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { enable } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `UPDATE staff_members SET can_login = $1, updated_at = NOW() WHERE id = $2 AND school_id = $3 RETURNING *`,
        [enable, id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Staff member not found' });
      }

      res.json({ 
        success: true, 
        message: enable ? 'Login enabled' : 'Login disabled'
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Toggle staff login error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle login access', error: error.message });
  }
};

export const resetStaffPassword = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await dbClient.query(
        `UPDATE staff_members SET password_hash = $1, can_login = true, updated_at = NOW() WHERE id = $2 AND school_id = $3 RETURNING id`,
        [hashedPassword, id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Staff member not found' });
      }

      res.json({ success: true, message: 'Password reset successfully' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Reset staff password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
  }
};


// =====================================================
// STATS / DASHBOARD
// =====================================================

export const getPeopleStats = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const [rolesResult, staffResult, parentsResult, teachersResult] = await Promise.all([
        dbClient.query(`SELECT COUNT(*) as count FROM user_roles WHERE school_id = $1`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM staff_members WHERE school_id = $1 AND is_active = true`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM parents WHERE school_id = $1 AND is_active = true`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM teachers WHERE school_id = $1`, [schoolId])
      ]);

      // Get staff by role
      const staffByRoleResult = await dbClient.query(
        `SELECT ur.name as role_name, ur.code as role_code, COUNT(sm.id) as count
         FROM user_roles ur
         LEFT JOIN staff_members sm ON ur.id = sm.role_id AND sm.is_active = true
         WHERE ur.school_id = $1
         GROUP BY ur.id, ur.name, ur.code
         ORDER BY ur.order_index ASC`,
        [schoolId]
      );

      res.json({
        success: true,
        data: {
          totalRoles: parseInt(rolesResult.rows[0].count),
          totalStaff: parseInt(staffResult.rows[0].count),
          totalParents: parseInt(parentsResult.rows[0].count),
          totalTeachers: parseInt(teachersResult.rows[0].count),
          staffByRole: staffByRoleResult.rows.map(r => ({
            roleName: r.role_name,
            roleCode: r.role_code,
            count: parseInt(r.count)
          }))
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get people stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats', error: error.message });
  }
};

