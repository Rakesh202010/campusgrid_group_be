import { getGroupDbClient } from '../lib/groupDb.js';
import bcrypt from 'bcryptjs';

// =====================================================
// TEACHER CRUD OPERATIONS
// =====================================================

export const getTeachers = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { status, department, is_class_teacher, search, academic_session_id } = req.query;

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
      
      // Get class-section names for class teachers
      let classTeacherMap = {};
      const classTeacherIds = result.rows
        .filter(r => r.class_teacher_of)
        .map(r => r.class_teacher_of);
      
      if (classTeacherIds.length > 0) {
        try {
          const csResult = await dbClient.query(`
            SELECT cs.id, cg.name as class_name, s.name as section_name
            FROM class_sections cs
            JOIN class_grades cg ON cs.class_grade_id = cg.id
            JOIN sections s ON cs.section_id = s.id
            WHERE cs.id = ANY($1)
          `, [classTeacherIds]);
          
          csResult.rows.forEach(cs => {
            classTeacherMap[cs.id] = `${cs.class_name} - ${cs.section_name}`;
          });
        } catch (e) { }
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
          hasLoginAccess: row.has_login_access,
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

      // Get qualifications
      let qualifications = [];
      try {
        const qualResult = await dbClient.query(
          `SELECT * FROM teacher_qualifications WHERE teacher_id = $1 ORDER BY year_of_passing DESC`,
          [id]
        );
        qualifications = qualResult.rows;
      } catch (e) { }

      // Get experience
      let experiences = [];
      try {
        const expResult = await dbClient.query(
          `SELECT * FROM teacher_experience WHERE teacher_id = $1 ORDER BY from_date DESC`,
          [id]
        );
        experiences = expResult.rows;
      } catch (e) { }

      // Get documents
      let documents = [];
      try {
        const docResult = await dbClient.query(
          `SELECT * FROM teacher_documents WHERE teacher_id = $1 ORDER BY created_at DESC`,
          [id]
        );
        documents = docResult.rows;
      } catch (e) { }

      // Get subject assignments
      let subjectAssignments = [];
      try {
        const subjResult = await dbClient.query(
          `SELECT ts.*, s.name as subject_name, s.code as subject_code,
                  cg.name as class_name, sec.name as section_name
           FROM teacher_subjects ts
           JOIN subjects s ON ts.subject_id = s.id
           LEFT JOIN class_sections cs ON ts.class_section_id = cs.id
           LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
           LEFT JOIN sections sec ON cs.section_id = sec.id
           WHERE ts.teacher_id = $1`,
          [id]
        );
        subjectAssignments = subjResult.rows;
      } catch (e) { }

      res.json({
        success: true,
        data: {
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
          hasLoginAccess: row.has_login_access,
          isActive: row.is_active,
          status: row.status,
          qualifications,
          experiences,
          documents,
          subjectAssignments
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

      // Log audit
      try {
        await dbClient.query(
          `INSERT INTO teacher_audit_logs (teacher_id, action, changed_by) VALUES ($1, $2, $3)`,
          [result.rows[0].id, 'CREATED', req.user.userId]
        );
      } catch (e) { }

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

export const updateTeacher = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const existing = await dbClient.query(
        `SELECT * FROM teachers WHERE id = $1 AND school_id = $2`,
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

      // Log audit
      try {
        await dbClient.query(
          `INSERT INTO teacher_audit_logs (teacher_id, action, changed_by) VALUES ($1, $2, $3)`,
          [id, 'UPDATED', req.user.userId]
        );
      } catch (e) { }

      res.json({ success: true, message: 'Teacher updated successfully', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update teacher error:', error);
    res.status(500).json({ success: false, message: 'Failed to update teacher', error: error.message });
  }
};

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

// =====================================================
// TEACHER LIFECYCLE MANAGEMENT
// =====================================================

export const changeTeacherStatus = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { status, reason, relievingDate } = req.body;

    if (!['active', 'suspended', 'relieved', 'on_leave', 'probation'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const existing = await dbClient.query(
        `SELECT status FROM teachers WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Teacher not found' });
      }

      const oldStatus = existing.rows[0].status;

      await dbClient.query(
        `UPDATE teachers SET status = $1, is_active = $2, updated_at = NOW() WHERE id = $3`,
        [status, status === 'active', id]
      );

      // Log audit
      try {
        await dbClient.query(
          `INSERT INTO teacher_audit_logs (teacher_id, action, field_name, old_value, new_value, changed_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, 'STATUS_CHANGE', 'status', oldStatus, status, req.user.userId]
        );
      } catch (e) { }

      res.json({ success: true, message: `Teacher status changed to ${status}` });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Change teacher status error:', error);
    res.status(500).json({ success: false, message: 'Failed to change status', error: error.message });
  }
};

// =====================================================
// SUBJECT ASSIGNMENT
// =====================================================

export const getTeacherSubjects = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { academic_session_id } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT ts.*, s.name as subject_name, s.code as subject_code, s.category,
               cg.name as class_name, cg.display_name as class_display_name,
               sec.name as section_name
        FROM teacher_subjects ts
        JOIN subjects s ON ts.subject_id = s.id
        LEFT JOIN class_sections cs ON ts.class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        WHERE ts.teacher_id = $1
      `;
      const params = [id];

      if (academic_session_id) {
        query += ` AND ts.academic_session_id = $2`;
        params.push(academic_session_id);
      }

      query += ` ORDER BY cg.numeric_value, sec.name, s.name`;

      const result = await dbClient.query(query, params);

      res.json({ 
        success: true, 
        data: result.rows.map(r => ({
          id: r.id,
          teacherId: r.teacher_id,
          subjectId: r.subject_id,
          subjectName: r.subject_name,
          subjectCode: r.subject_code,
          category: r.category,
          classSectionId: r.class_section_id,
          className: r.class_name || r.class_display_name,
          sectionName: r.section_name,
          academicSessionId: r.academic_session_id,
          isPrimary: r.is_primary,
          periodsPerWeek: r.periods_per_week,
          createdAt: r.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get teacher subjects error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch subjects', error: error.message });
  }
};

export const assignSubject = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { subjectId, classSectionId, academicSessionId, isPrimary, periodsPerWeek } = req.body;

    if (!subjectId || !academicSessionId) {
      return res.status(400).json({ success: false, message: 'Subject and academic session are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if assignment already exists
      const existing = await dbClient.query(
        `SELECT id FROM teacher_subjects 
         WHERE teacher_id = $1 AND subject_id = $2 AND class_section_id = $3 AND academic_session_id = $4`,
        [id, subjectId, classSectionId, academicSessionId]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Subject already assigned' });
      }

      const result = await dbClient.query(
        `INSERT INTO teacher_subjects (teacher_id, subject_id, class_section_id, academic_session_id, is_primary, periods_per_week)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [id, subjectId, classSectionId, academicSessionId, isPrimary || false, periodsPerWeek || 0]
      );

      res.status(201).json({ success: true, message: 'Subject assigned', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Assign subject error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign subject', error: error.message });
  }
};

export const bulkAssignSubjects = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { assignments, academicSessionId } = req.body;

    if (!assignments || !Array.isArray(assignments) || !academicSessionId) {
      return res.status(400).json({ success: false, message: 'Assignments array and academic session are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let created = 0;
      let skipped = 0;

      for (const assignment of assignments) {
        const existing = await dbClient.query(
          `SELECT id FROM teacher_subjects 
           WHERE teacher_id = $1 AND subject_id = $2 AND class_section_id = $3 AND academic_session_id = $4`,
          [id, assignment.subjectId, assignment.classSectionId, academicSessionId]
        );

        if (existing.rows.length === 0) {
          await dbClient.query(
            `INSERT INTO teacher_subjects (teacher_id, subject_id, class_section_id, academic_session_id, is_primary, periods_per_week)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id, assignment.subjectId, assignment.classSectionId, academicSessionId, assignment.isPrimary || false, assignment.periodsPerWeek || 0]
          );
          created++;
        } else {
          skipped++;
        }
      }

      res.json({ success: true, message: `Assigned ${created} subjects, skipped ${skipped}` });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Bulk assign subjects error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign subjects', error: error.message });
  }
};

export const removeSubjectAssignment = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id, assignmentId } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(
        `DELETE FROM teacher_subjects WHERE id = $1 AND teacher_id = $2`,
        [assignmentId, id]
      );

      res.json({ success: true, message: 'Subject assignment removed' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Remove subject assignment error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove assignment', error: error.message });
  }
};

// =====================================================
// LEAVE MANAGEMENT
// =====================================================

export const getLeaveTypes = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT * FROM teacher_leave_types WHERE school_id = $1 ORDER BY name`,
        [schoolId]
      );

      res.json({ 
        success: true, 
        data: result.rows.map(r => ({
          id: r.id,
          name: r.name,
          code: r.code,
          description: r.description,
          daysPerYear: r.days_per_year,
          isPaid: r.is_paid,
          requiresApproval: r.requires_approval,
          canCarryForward: r.can_carry_forward,
          maxCarryForwardDays: r.max_carry_forward_days,
          isActive: r.is_active
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get leave types error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leave types', error: error.message });
  }
};

export const createLeaveType = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { name, code, description, daysPerYear, isPaid, requiresApproval, canCarryForward, maxCarryForwardDays } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `INSERT INTO teacher_leave_types (school_id, name, code, description, days_per_year, is_paid, requires_approval, can_carry_forward, max_carry_forward_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [schoolId, name, code, description, daysPerYear || 0, isPaid !== false, requiresApproval !== false, canCarryForward || false, maxCarryForwardDays || 0]
      );

      res.status(201).json({ success: true, message: 'Leave type created', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create leave type error:', error);
    res.status(500).json({ success: false, message: 'Failed to create leave type', error: error.message });
  }
};

export const getLeaveBalance = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { academic_session_id } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get leave types
      const leaveTypes = await dbClient.query(
        `SELECT * FROM teacher_leave_types WHERE school_id = $1 AND is_active = true`,
        [schoolId]
      );

      // Get leave balance if exists
      let balances = [];
      if (academic_session_id) {
        const balanceResult = await dbClient.query(
          `SELECT lb.*, lt.name as leave_type_name, lt.code as leave_type_code, lt.days_per_year
           FROM teacher_leave_balance lb
           JOIN teacher_leave_types lt ON lb.leave_type_id = lt.id
           WHERE lb.teacher_id = $1 AND lb.academic_session_id = $2`,
          [id, academic_session_id]
        );
        balances = balanceResult.rows;
      }

      // If no balance records, create from leave types
      const result = leaveTypes.rows.map(lt => {
        const balance = balances.find(b => b.leave_type_id === lt.id);
        return {
          leaveTypeId: lt.id,
          leaveTypeName: lt.name,
          leaveTypeCode: lt.code,
          totalDays: balance?.total_days ?? lt.days_per_year,
          usedDays: balance?.used_days ?? 0,
          carriedForward: balance?.carried_forward ?? 0,
          remainingDays: (balance?.total_days ?? lt.days_per_year) - (balance?.used_days ?? 0)
        };
      });

      res.json({ success: true, data: result });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get leave balance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leave balance', error: error.message });
  }
};

export const applyLeave = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { leaveTypeId, fromDate, toDate, reason } = req.body;

    if (!leaveTypeId || !fromDate || !toDate) {
      return res.status(400).json({ success: false, message: 'Leave type, from date and to date are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Calculate days
      const from = new Date(fromDate);
      const to = new Date(toDate);
      const days = Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1;

      const result = await dbClient.query(
        `INSERT INTO teacher_leave_applications 
         (teacher_id, leave_type_id, from_date, to_date, days, reason, school_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING *`,
        [id, leaveTypeId, fromDate, toDate, days, reason, schoolId]
      );

      res.status(201).json({ success: true, message: 'Leave application submitted', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Apply leave error:', error);
    res.status(500).json({ success: false, message: 'Failed to apply leave', error: error.message });
  }
};

export const getLeaveApplications = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { status } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT la.*, lt.name as leave_type_name, lt.code as leave_type_code
        FROM teacher_leave_applications la
        JOIN teacher_leave_types lt ON la.leave_type_id = lt.id
        WHERE la.teacher_id = $1
      `;
      const params = [id];

      if (status) {
        query += ` AND la.status = $2`;
        params.push(status);
      }

      query += ` ORDER BY la.created_at DESC`;

      const result = await dbClient.query(query, params);

      res.json({ 
        success: true, 
        data: result.rows.map(r => ({
          id: r.id,
          teacherId: r.teacher_id,
          leaveTypeId: r.leave_type_id,
          leaveTypeName: r.leave_type_name,
          leaveTypeCode: r.leave_type_code,
          fromDate: r.from_date,
          toDate: r.to_date,
          days: r.days,
          reason: r.reason,
          status: r.status,
          approvedBy: r.approved_by,
          approvedAt: r.approved_at,
          rejectionReason: r.rejection_reason,
          createdAt: r.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get leave applications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leave applications', error: error.message });
  }
};

export const getAllLeaveApplications = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { status } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT la.*, lt.name as leave_type_name, lt.code as leave_type_code,
               t.first_name, t.last_name, t.employee_id
        FROM teacher_leave_applications la
        JOIN teacher_leave_types lt ON la.leave_type_id = lt.id
        JOIN teachers t ON la.teacher_id = t.id
        WHERE la.school_id = $1
      `;
      const params = [schoolId];

      if (status) {
        query += ` AND la.status = $2`;
        params.push(status);
      }

      query += ` ORDER BY la.created_at DESC`;

      const result = await dbClient.query(query, params);

      res.json({ 
        success: true, 
        data: result.rows.map(r => ({
          id: r.id,
          teacherId: r.teacher_id,
          teacherName: `${r.first_name} ${r.last_name || ''}`.trim(),
          employeeId: r.employee_id,
          leaveTypeId: r.leave_type_id,
          leaveTypeName: r.leave_type_name,
          leaveTypeCode: r.leave_type_code,
          fromDate: r.from_date,
          toDate: r.to_date,
          days: r.days,
          reason: r.reason,
          status: r.status,
          approvedBy: r.approved_by,
          approvedAt: r.approved_at,
          rejectionReason: r.rejection_reason,
          createdAt: r.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get all leave applications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch leave applications', error: error.message });
  }
};

export const processLeave = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id, applicationId } = req.params;
    const { action, rejectionReason } = req.body;

    if (!['approved', 'rejected'].includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(
        `UPDATE teacher_leave_applications 
         SET status = $1, approved_by = $2, approved_at = NOW(), rejection_reason = $3
         WHERE id = $4 AND teacher_id = $5`,
        [action, req.user.userId, rejectionReason, applicationId, id]
      );

      // If approved, update leave balance
      if (action === 'approved') {
        const application = await dbClient.query(
          `SELECT leave_type_id, days FROM teacher_leave_applications WHERE id = $1`,
          [applicationId]
        );

        if (application.rows.length > 0) {
          await dbClient.query(
            `UPDATE teacher_leave_balance 
             SET used_days = used_days + $1 
             WHERE teacher_id = $2 AND leave_type_id = $3`,
            [application.rows[0].days, id, application.rows[0].leave_type_id]
          );
        }
      }

      res.json({ success: true, message: `Leave ${action}` });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Process leave error:', error);
    res.status(500).json({ success: false, message: 'Failed to process leave', error: error.message });
  }
};

// =====================================================
// ATTENDANCE
// =====================================================

export const getTeacherAttendance = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { month, year } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `SELECT * FROM teacher_attendance WHERE teacher_id = $1`;
      const params = [id];

      if (month && year) {
        query += ` AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3`;
        params.push(parseInt(month), parseInt(year));
      }

      query += ` ORDER BY date DESC`;

      const result = await dbClient.query(query, params);

      res.json({ 
        success: true, 
        data: result.rows.map(r => ({
          id: r.id,
          date: r.date,
          status: r.status,
          checkInTime: r.check_in_time,
          checkOutTime: r.check_out_time,
          remarks: r.remarks
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get teacher attendance error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance', error: error.message });
  }
};

export const markTeacherAttendance = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { attendances } = req.body; // Array of { teacherId, date, status, checkInTime, checkOutTime, remarks }

    if (!attendances || !Array.isArray(attendances)) {
      return res.status(400).json({ success: false, message: 'Attendances array is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let marked = 0;
      for (const att of attendances) {
        await dbClient.query(
          `INSERT INTO teacher_attendance (teacher_id, date, status, check_in_time, check_out_time, remarks, marked_by, school_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (teacher_id, date) DO UPDATE SET status = $3, check_in_time = $4, check_out_time = $5, remarks = $6`,
          [att.teacherId, att.date, att.status || 'present', att.checkInTime, att.checkOutTime, att.remarks, req.user.userId, schoolId]
        );
        marked++;
      }

      res.json({ success: true, message: `Marked attendance for ${marked} teachers` });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Mark teacher attendance error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark attendance', error: error.message });
  }
};

export const getAttendanceSummary = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { date, month, year } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get all teachers
      const teachers = await dbClient.query(
        `SELECT id, first_name, last_name, employee_id, department FROM teachers WHERE school_id = $1 AND is_active = true`,
        [schoolId]
      );

      let attendanceData = [];
      if (date) {
        // Single date attendance
        const attendance = await dbClient.query(
          `SELECT * FROM teacher_attendance WHERE school_id = $1 AND date = $2`,
          [schoolId, date]
        );

        attendanceData = teachers.rows.map(t => {
          const att = attendance.rows.find(a => a.teacher_id === t.id);
          return {
            teacherId: t.id,
            teacherName: `${t.first_name} ${t.last_name || ''}`.trim(),
            employeeId: t.employee_id,
            department: t.department,
            date: date,
            status: att?.status || 'not_marked',
            checkInTime: att?.check_in_time,
            checkOutTime: att?.check_out_time
          };
        });
      } else if (month && year) {
        // Monthly summary
        const attendance = await dbClient.query(
          `SELECT teacher_id, status, COUNT(*) as count 
           FROM teacher_attendance 
           WHERE school_id = $1 AND EXTRACT(MONTH FROM date) = $2 AND EXTRACT(YEAR FROM date) = $3
           GROUP BY teacher_id, status`,
          [schoolId, parseInt(month), parseInt(year)]
        );

        attendanceData = teachers.rows.map(t => {
          const presentCount = attendance.rows.find(a => a.teacher_id === t.id && a.status === 'present')?.count || 0;
          const absentCount = attendance.rows.find(a => a.teacher_id === t.id && a.status === 'absent')?.count || 0;
          const leaveCount = attendance.rows.find(a => a.teacher_id === t.id && a.status === 'leave')?.count || 0;
          return {
            teacherId: t.id,
            teacherName: `${t.first_name} ${t.last_name || ''}`.trim(),
            employeeId: t.employee_id,
            department: t.department,
            present: parseInt(presentCount),
            absent: parseInt(absentCount),
            leave: parseInt(leaveCount)
          };
        });
      }

      res.json({ success: true, data: attendanceData });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get attendance summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch attendance summary', error: error.message });
  }
};

// =====================================================
// QUALIFICATIONS & EXPERIENCE
// =====================================================

export const addQualification = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id } = req.params;
    const { degree, specialization, institution, university, yearOfPassing, percentage, grade, documentUrl } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `INSERT INTO teacher_qualifications 
         (teacher_id, degree, specialization, institution, university, year_of_passing, percentage, grade, document_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [id, degree, specialization, institution, university, yearOfPassing, percentage, grade, documentUrl]
      );

      res.status(201).json({ success: true, message: 'Qualification added', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Add qualification error:', error);
    res.status(500).json({ success: false, message: 'Failed to add qualification', error: error.message });
  }
};

export const getQualifications = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT * FROM teacher_qualifications WHERE teacher_id = $1 ORDER BY year_of_passing DESC`,
        [id]
      );

      res.json({ 
        success: true, 
        data: result.rows.map(r => ({
          id: r.id,
          degree: r.degree,
          specialization: r.specialization,
          institution: r.institution,
          university: r.university,
          yearOfPassing: r.year_of_passing,
          percentage: r.percentage,
          grade: r.grade,
          documentUrl: r.document_url
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get qualifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch qualifications', error: error.message });
  }
};

export const deleteQualification = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id, qualId } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(`DELETE FROM teacher_qualifications WHERE id = $1 AND teacher_id = $2`, [qualId, id]);
      res.json({ success: true, message: 'Qualification deleted' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Delete qualification error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete qualification', error: error.message });
  }
};

export const addExperience = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id } = req.params;
    const { organization, designation, fromDate, toDate, responsibilities, reasonForLeaving, referenceContact, documentUrl } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `INSERT INTO teacher_experience 
         (teacher_id, organization, designation, from_date, to_date, responsibilities, reason_for_leaving, reference_contact, document_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [id, organization, designation, fromDate, toDate, responsibilities, reasonForLeaving, referenceContact, documentUrl]
      );

      res.status(201).json({ success: true, message: 'Experience added', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Add experience error:', error);
    res.status(500).json({ success: false, message: 'Failed to add experience', error: error.message });
  }
};

export const getExperiences = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT * FROM teacher_experience WHERE teacher_id = $1 ORDER BY from_date DESC`,
        [id]
      );

      res.json({ 
        success: true, 
        data: result.rows.map(r => ({
          id: r.id,
          organization: r.organization,
          designation: r.designation,
          fromDate: r.from_date,
          toDate: r.to_date,
          responsibilities: r.responsibilities,
          reasonForLeaving: r.reason_for_leaving,
          referenceContact: r.reference_contact,
          documentUrl: r.document_url
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get experiences error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch experiences', error: error.message });
  }
};

export const deleteExperience = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id, expId } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(`DELETE FROM teacher_experience WHERE id = $1 AND teacher_id = $2`, [expId, id]);
      res.json({ success: true, message: 'Experience deleted' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Delete experience error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete experience', error: error.message });
  }
};

// =====================================================
// DOCUMENTS
// =====================================================

export const getDocuments = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT * FROM teacher_documents WHERE teacher_id = $1 ORDER BY created_at DESC`,
        [id]
      );

      res.json({ 
        success: true, 
        data: result.rows.map(r => ({
          id: r.id,
          documentType: r.document_type,
          documentName: r.document_name,
          fileUrl: r.file_url,
          fileSize: r.file_size,
          mimeType: r.mime_type,
          verified: r.verified,
          verifiedBy: r.verified_by,
          verifiedAt: r.verified_at,
          expiryDate: r.expiry_date,
          remarks: r.remarks,
          createdAt: r.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch documents', error: error.message });
  }
};

export const addDocument = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id } = req.params;
    const { documentType, documentName, fileUrl, fileSize, mimeType, expiryDate, remarks } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `INSERT INTO teacher_documents (teacher_id, document_type, document_name, file_url, file_size, mime_type, expiry_date, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [id, documentType, documentName, fileUrl, fileSize, mimeType, expiryDate, remarks]
      );

      res.status(201).json({ success: true, message: 'Document added', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Add document error:', error);
    res.status(500).json({ success: false, message: 'Failed to add document', error: error.message });
  }
};

export const verifyDocument = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id, docId } = req.params;
    const { verified, remarks } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(
        `UPDATE teacher_documents SET verified = $1, verified_by = $2, verified_at = NOW(), remarks = $3 WHERE id = $4 AND teacher_id = $5`,
        [verified, req.user.userId, remarks, docId, id]
      );

      res.json({ success: true, message: 'Document verification updated' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Verify document error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify document', error: error.message });
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id, docId } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(`DELETE FROM teacher_documents WHERE id = $1 AND teacher_id = $2`, [docId, id]);
      res.json({ success: true, message: 'Document deleted' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete document', error: error.message });
  }
};

// =====================================================
// TEACHER CREDENTIALS/LOGIN
// =====================================================

export const createTeacherLogin = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if teacher exists
      const teacher = await dbClient.query(`SELECT * FROM teachers WHERE id = $1 AND school_id = $2`, [id, schoolId]);
      if (teacher.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Teacher not found' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update teacher with login credentials
      await dbClient.query(
        `UPDATE teachers SET username = $1, password_hash = $2, has_login_access = true WHERE id = $3`,
        [username, hashedPassword, id]
      );

      // Log audit
      try {
        await dbClient.query(
          `INSERT INTO teacher_audit_logs (teacher_id, action, changed_by) VALUES ($1, $2, $3)`,
          [id, 'LOGIN_CREATED', req.user.userId]
        );
      } catch (e) { }

      res.json({ success: true, message: 'Login credentials created for teacher' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create teacher login error:', error);
    res.status(500).json({ success: false, message: 'Failed to create login', error: error.message });
  }
};

export const resetTeacherPassword = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      await dbClient.query(`UPDATE teachers SET password_hash = $1 WHERE id = $2 AND school_id = $3`, [hashedPassword, id, schoolId]);

      // Log audit
      try {
        await dbClient.query(
          `INSERT INTO teacher_audit_logs (teacher_id, action, changed_by) VALUES ($1, $2, $3)`,
          [id, 'PASSWORD_RESET', req.user.userId]
        );
      } catch (e) { }

      res.json({ success: true, message: 'Password reset successfully' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Reset teacher password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password', error: error.message });
  }
};

export const toggleLoginAccess = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { enabled } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(`UPDATE teachers SET has_login_access = $1 WHERE id = $2 AND school_id = $3`, [enabled, id, schoolId]);
      res.json({ success: true, message: `Login access ${enabled ? 'enabled' : 'disabled'}` });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Toggle login access error:', error);
    res.status(500).json({ success: false, message: 'Failed to toggle login access', error: error.message });
  }
};

// =====================================================
// STATS & AUDIT
// =====================================================

export const getTeacherStats = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const [totalResult, activeResult, classTeacherResult, deptResult, statusResult, genderResult, loginResult] = await Promise.all([
        dbClient.query(`SELECT COUNT(*) as count FROM teachers WHERE school_id = $1`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM teachers WHERE school_id = $1 AND is_active = true`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM teachers WHERE school_id = $1 AND is_class_teacher = true`, [schoolId]),
        dbClient.query(
          `SELECT department, COUNT(*) as count FROM teachers WHERE school_id = $1 AND department IS NOT NULL GROUP BY department ORDER BY count DESC`,
          [schoolId]
        ),
        dbClient.query(
          `SELECT status, COUNT(*) as count FROM teachers WHERE school_id = $1 GROUP BY status`,
          [schoolId]
        ),
        dbClient.query(
          `SELECT gender, COUNT(*) as count FROM teachers WHERE school_id = $1 AND gender IS NOT NULL GROUP BY gender`,
          [schoolId]
        ),
        dbClient.query(`SELECT COUNT(*) as count FROM teachers WHERE school_id = $1 AND has_login_access = true`, [schoolId])
      ]);

      // Get recent joinings
      const recentJoinings = await dbClient.query(
        `SELECT id, first_name, last_name, joining_date, department 
         FROM teachers WHERE school_id = $1 AND joining_date IS NOT NULL
         ORDER BY joining_date DESC LIMIT 5`,
        [schoolId]
      );

      // Get pending leave count
      let pendingLeaves = 0;
      try {
        const leaveResult = await dbClient.query(
          `SELECT COUNT(*) as count FROM teacher_leave_applications WHERE school_id = $1 AND status = 'pending'`,
          [schoolId]
        );
        pendingLeaves = parseInt(leaveResult.rows[0].count);
      } catch (e) { }

      res.json({
        success: true,
        data: {
          total: parseInt(totalResult.rows[0].count),
          active: parseInt(activeResult.rows[0].count),
          classTeachers: parseInt(classTeacherResult.rows[0].count),
          withLoginAccess: parseInt(loginResult.rows[0].count),
          pendingLeaves,
          byDepartment: deptResult.rows.map(r => ({
            department: r.department,
            count: parseInt(r.count)
          })),
          byStatus: statusResult.rows.map(r => ({
            status: r.status || 'active',
            count: parseInt(r.count)
          })),
          byGender: genderResult.rows.map(r => ({
            gender: r.gender,
            count: parseInt(r.count)
          })),
          recentJoinings: recentJoinings.rows.map(r => ({
            id: r.id,
            name: `${r.first_name} ${r.last_name || ''}`.trim(),
            joiningDate: r.joining_date,
            department: r.department
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

export const getAuditLogs = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT * FROM teacher_audit_logs WHERE teacher_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [id]
      );

      res.json({ 
        success: true, 
        data: result.rows.map(r => ({
          id: r.id,
          action: r.action,
          fieldName: r.field_name,
          oldValue: r.old_value,
          newValue: r.new_value,
          changedBy: r.changed_by,
          ipAddress: r.ip_address,
          userAgent: r.user_agent,
          createdAt: r.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs', error: error.message });
  }
};

// =====================================================
// BULK OPERATIONS
// =====================================================

export const bulkImportTeachers = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { teachers } = req.body;

    if (!teachers || !Array.isArray(teachers)) {
      return res.status(400).json({ success: false, message: 'Teachers array is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let imported = 0;
      let skipped = 0;
      const errors = [];

      for (const t of teachers) {
        try {
          if (!t.firstName) {
            errors.push(`Row skipped: First name is required`);
            skipped++;
            continue;
          }

          // Check duplicates
          if (t.employeeId) {
            const existing = await dbClient.query(
              `SELECT id FROM teachers WHERE school_id = $1 AND employee_id = $2`,
              [schoolId, t.employeeId]
            );
            if (existing.rows.length > 0) {
              errors.push(`Employee ID ${t.employeeId} already exists`);
              skipped++;
              continue;
            }
          }

          await dbClient.query(
            `INSERT INTO teachers (
              school_id, employee_id, first_name, last_name, email, phone, gender,
              date_of_birth, qualification, department, designation, joining_date, status, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'active', true)`,
            [
              schoolId, t.employeeId, t.firstName, t.lastName, t.email, t.phone, t.gender,
              t.dateOfBirth, t.qualification, t.department, t.designation, t.joiningDate
            ]
          );
          imported++;
        } catch (e) {
          errors.push(`Error importing ${t.firstName}: ${e.message}`);
          skipped++;
        }
      }

      res.json({ 
        success: true, 
        message: `Imported ${imported} teachers, skipped ${skipped}`,
        data: { imported, skipped, errors }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Bulk import teachers error:', error);
    res.status(500).json({ success: false, message: 'Failed to import teachers', error: error.message });
  }
};

export const exportTeachers = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { format } = req.query; // 'json' or 'csv'

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT * FROM teachers WHERE school_id = $1 ORDER BY first_name`,
        [schoolId]
      );

      const data = result.rows.map(r => ({
        employeeId: r.employee_id,
        firstName: r.first_name,
        lastName: r.last_name,
        email: r.email,
        phone: r.phone,
        gender: r.gender,
        dateOfBirth: r.date_of_birth,
        qualification: r.qualification,
        department: r.department,
        designation: r.designation,
        joiningDate: r.joining_date,
        status: r.status
      }));

      if (format === 'csv') {
        const headers = Object.keys(data[0] || {}).join(',');
        const rows = data.map(d => Object.values(d).map(v => `"${v || ''}"`).join(','));
        const csv = [headers, ...rows].join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=teachers.csv');
        return res.send(csv);
      }

      res.json({ success: true, data });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Export teachers error:', error);
    res.status(500).json({ success: false, message: 'Failed to export teachers', error: error.message });
  }
};
