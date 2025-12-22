import { getGroupDbClient } from '../lib/groupDb.js';

// Get all teachers with comprehensive details
export const getTeachers = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { status, department, is_class_teacher, search } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `SELECT * FROM teachers WHERE school_id = $1`;
      const params = [schoolId];
      let paramIndex = 2;

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (department) {
        query += ` AND department = $${paramIndex}`;
        params.push(department);
        paramIndex++;
      }

      if (is_class_teacher === 'true') {
        query += ` AND is_class_teacher = true`;
      }

      if (search) {
        query += ` AND (first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex} OR employee_id ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      query += ` ORDER BY first_name ASC, last_name ASC`;

      const result = await dbClient.query(query, params);
      
      // Get class-section names for class teachers if needed
      let classTeacherMap = {};
      const classTeacherIds = result.rows
        .filter(r => r.class_teacher_of)
        .map(r => r.class_teacher_of);
      
      if (classTeacherIds.length > 0) {
        try {
          const csResult = await dbClient.query(`
            SELECT cs.id, cg.name as class_name, s.name as section_name
            FROM class_sections cs
            JOIN class_grades cg ON cs.grade_id = cg.id
            JOIN sections s ON cs.section_id = s.id
            WHERE cs.id = ANY($1)
          `, [classTeacherIds]);
          
          csResult.rows.forEach(cs => {
            classTeacherMap[cs.id] = `${cs.class_name} - ${cs.section_name}`;
          });
        } catch (e) {
          // Ignore if tables don't exist
        }
      }

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
          alternatePhone: row.alternate_phone,
          dateOfBirth: row.date_of_birth,
          gender: row.gender,
          bloodGroup: row.blood_group,
          nationality: row.nationality,
          religion: row.religion,
          maritalStatus: row.marital_status,
          qualification: row.qualification,
          specialization: row.specialization,
          experience: row.experience,
          joiningDate: row.joining_date,
          address: row.address,
          city: row.city,
          state: row.state,
          pincode: row.pincode,
          emergencyContactName: row.emergency_contact_name,
          emergencyContactPhone: row.emergency_contact_phone,
          emergencyContactRelation: row.emergency_contact_relation,
          department: row.department,
          designation: row.designation,
          employmentType: row.employment_type,
          subjects: row.subjects || [],
          salary: row.salary ? parseFloat(row.salary) : null,
          bankAccountNo: row.bank_account_no,
          bankName: row.bank_name,
          ifscCode: row.ifsc_code,
          panNumber: row.pan_number,
          aadharNumber: row.aadhar_number,
          profilePhotoUrl: row.profile_photo_url,
          isClassTeacher: row.is_class_teacher,
          classTeacherOf: row.class_teacher_of,
          classTeacherOfName: classTeacherMap[row.class_teacher_of] || null,
          canTakeAttendance: row.can_take_attendance,
          canManageExams: row.can_manage_exams,
          isActive: row.is_active !== false,
          status: row.status || 'active',
          createdAt: row.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get teachers error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch teachers', error: error.message });
  }
};

// Get single teacher by ID
export const getTeacherById = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT * FROM teachers WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Teacher not found' });
      }

      const row = result.rows[0];
      res.json({
        success: true,
        data: {
          id: row.id,
          employeeId: row.employee_id,
          firstName: row.first_name,
          lastName: row.last_name,
          email: row.email,
          phone: row.phone,
          alternatePhone: row.alternate_phone,
          dateOfBirth: row.date_of_birth,
          gender: row.gender,
          bloodGroup: row.blood_group,
          nationality: row.nationality,
          religion: row.religion,
          maritalStatus: row.marital_status,
          qualification: row.qualification,
          specialization: row.specialization,
          experience: row.experience,
          joiningDate: row.joining_date,
          address: row.address,
          city: row.city,
          state: row.state,
          pincode: row.pincode,
          emergencyContactName: row.emergency_contact_name,
          emergencyContactPhone: row.emergency_contact_phone,
          emergencyContactRelation: row.emergency_contact_relation,
          department: row.department,
          designation: row.designation,
          employmentType: row.employment_type,
          subjects: row.subjects || [],
          salary: row.salary,
          bankAccountNo: row.bank_account_no,
          bankName: row.bank_name,
          ifscCode: row.ifsc_code,
          panNumber: row.pan_number,
          aadharNumber: row.aadhar_number,
          profilePhotoUrl: row.profile_photo_url,
          isClassTeacher: row.is_class_teacher,
          classTeacherOf: row.class_teacher_of,
          canTakeAttendance: row.can_take_attendance,
          canManageExams: row.can_manage_exams,
          isActive: row.is_active,
          status: row.status
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get teacher by id error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch teacher', error: error.message });
  }
};

// Create new teacher
export const createTeacher = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const {
      employeeId, firstName, lastName, email, phone, alternatePhone,
      dateOfBirth, gender, bloodGroup, nationality, religion, maritalStatus,
      qualification, specialization, experience, joiningDate,
      address, city, state, pincode,
      emergencyContactName, emergencyContactPhone, emergencyContactRelation,
      department, designation, employmentType, subjects,
      salary, bankAccountNo, bankName, ifscCode, panNumber, aadharNumber,
      isClassTeacher, classTeacherOf, canTakeAttendance, canManageExams
    } = req.body;

    if (!firstName) {
      return res.status(400).json({ success: false, message: 'First name is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for duplicate employee ID or email
      if (employeeId) {
        const existingEmpId = await dbClient.query(
          `SELECT id FROM teachers WHERE school_id = $1 AND employee_id = $2`,
          [schoolId, employeeId]
        );
        if (existingEmpId.rows.length > 0) {
          return res.status(400).json({ success: false, message: 'Employee ID already exists' });
        }
      }

      if (email) {
        const existingEmail = await dbClient.query(
          `SELECT id FROM teachers WHERE school_id = $1 AND email = $2`,
          [schoolId, email]
        );
        if (existingEmail.rows.length > 0) {
          return res.status(400).json({ success: false, message: 'Email already exists' });
        }
      }

      const result = await dbClient.query(
        `INSERT INTO teachers (
          school_id, employee_id, first_name, last_name, email, phone, alternate_phone,
          date_of_birth, gender, blood_group, nationality, religion, marital_status,
          qualification, specialization, experience, joining_date,
          address, city, state, pincode,
          emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
          department, designation, employment_type, subjects,
          salary, bank_account_no, bank_name, ifsc_code, pan_number, aadhar_number,
          is_class_teacher, class_teacher_of, can_take_attendance, can_manage_exams,
          status, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40)
        RETURNING *`,
        [
          schoolId, employeeId, firstName, lastName, email, phone, alternatePhone,
          dateOfBirth, gender, bloodGroup, nationality || 'Indian', religion, maritalStatus,
          qualification, specialization, experience, joiningDate,
          address, city, state, pincode,
          emergencyContactName, emergencyContactPhone, emergencyContactRelation,
          department, designation, employmentType || 'permanent', subjects || [],
          salary, bankAccountNo, bankName, ifscCode, panNumber, aadharNumber,
          isClassTeacher || false, classTeacherOf,
          canTakeAttendance !== false, canManageExams !== false,
          'active', true
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Teacher added successfully',
        data: result.rows[0]
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create teacher error:', error);
    res.status(500).json({ success: false, message: 'Failed to add teacher', error: error.message });
  }
};

// Update teacher
export const updateTeacher = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if teacher exists
      const existing = await dbClient.query(
        `SELECT id FROM teachers WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Teacher not found' });
      }

      const result = await dbClient.query(
        `UPDATE teachers SET
          employee_id = COALESCE($1, employee_id),
          first_name = COALESCE($2, first_name),
          last_name = COALESCE($3, last_name),
          email = COALESCE($4, email),
          phone = COALESCE($5, phone),
          alternate_phone = COALESCE($6, alternate_phone),
          date_of_birth = COALESCE($7, date_of_birth),
          gender = COALESCE($8, gender),
          blood_group = COALESCE($9, blood_group),
          nationality = COALESCE($10, nationality),
          religion = COALESCE($11, religion),
          marital_status = COALESCE($12, marital_status),
          qualification = COALESCE($13, qualification),
          specialization = COALESCE($14, specialization),
          experience = COALESCE($15, experience),
          joining_date = COALESCE($16, joining_date),
          address = COALESCE($17, address),
          city = COALESCE($18, city),
          state = COALESCE($19, state),
          pincode = COALESCE($20, pincode),
          emergency_contact_name = COALESCE($21, emergency_contact_name),
          emergency_contact_phone = COALESCE($22, emergency_contact_phone),
          emergency_contact_relation = COALESCE($23, emergency_contact_relation),
          department = COALESCE($24, department),
          designation = COALESCE($25, designation),
          employment_type = COALESCE($26, employment_type),
          subjects = COALESCE($27, subjects),
          salary = COALESCE($28, salary),
          bank_account_no = COALESCE($29, bank_account_no),
          bank_name = COALESCE($30, bank_name),
          ifsc_code = COALESCE($31, ifsc_code),
          pan_number = COALESCE($32, pan_number),
          aadhar_number = COALESCE($33, aadhar_number),
          is_class_teacher = COALESCE($34, is_class_teacher),
          class_teacher_of = COALESCE($35, class_teacher_of),
          can_take_attendance = COALESCE($36, can_take_attendance),
          can_manage_exams = COALESCE($37, can_manage_exams),
          is_active = COALESCE($38, is_active),
          status = COALESCE($39, status),
          updated_at = NOW()
        WHERE id = $40 AND school_id = $41
        RETURNING *`,
        [
          updates.employeeId, updates.firstName, updates.lastName, updates.email,
          updates.phone, updates.alternatePhone, updates.dateOfBirth, updates.gender,
          updates.bloodGroup, updates.nationality, updates.religion, updates.maritalStatus,
          updates.qualification, updates.specialization, updates.experience, updates.joiningDate,
          updates.address, updates.city, updates.state, updates.pincode,
          updates.emergencyContactName, updates.emergencyContactPhone, updates.emergencyContactRelation,
          updates.department, updates.designation, updates.employmentType, updates.subjects,
          updates.salary, updates.bankAccountNo, updates.bankName, updates.ifscCode,
          updates.panNumber, updates.aadharNumber,
          updates.isClassTeacher, updates.classTeacherOf,
          updates.canTakeAttendance, updates.canManageExams,
          updates.isActive, updates.status, id, schoolId
        ]
      );

      res.json({ success: true, message: 'Teacher updated successfully', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update teacher error:', error);
    res.status(500).json({ success: false, message: 'Failed to update teacher', error: error.message });
  }
};

// Delete teacher
export const deleteTeacher = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM teachers WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Teacher not found' });
      }

      res.json({ success: true, message: 'Teacher deleted successfully' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete teacher error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete teacher', error: error.message });
  }
};

// Get teacher stats
export const getTeacherStats = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const [totalResult, activeResult, classTeacherResult, deptResult] = await Promise.all([
        dbClient.query(`SELECT COUNT(*) as count FROM teachers WHERE school_id = $1`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM teachers WHERE school_id = $1 AND is_active = true`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM teachers WHERE school_id = $1 AND is_class_teacher = true`, [schoolId]),
        dbClient.query(
          `SELECT department, COUNT(*) as count FROM teachers WHERE school_id = $1 AND department IS NOT NULL GROUP BY department`,
          [schoolId]
        )
      ]);

      res.json({
        success: true,
        data: {
          total: parseInt(totalResult.rows[0].count),
          active: parseInt(activeResult.rows[0].count),
          classTeachers: parseInt(classTeacherResult.rows[0].count),
          byDepartment: deptResult.rows.map(r => ({
            department: r.department,
            count: parseInt(r.count)
          }))
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get teacher stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats', error: error.message });
  }
};

