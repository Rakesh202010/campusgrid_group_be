import bcrypt from 'bcryptjs';
import pg from 'pg';
import prismaAdmin from '../lib/prisma.js';
import { getGroupDbClient } from '../lib/groupDb.js';

const { Client } = pg;

/**
 * Create/Onboard a new school with admin credentials
 * Now stores in group database instead of admin database
 */
export const onboardSchool = async (req, res) => {
  try {
    const {
      // Basic Details
      schoolName,
      schoolCode,
      schoolType,
      educationBoard,
      academicLevel,
      description,
      logoUrl,
      
      // Address
      addressLine1,
      addressLine2,
      city,
      district,
      state,
      country,
      pincode,
      
      // Primary Contact
      primaryContactName,
      primaryContactRole,
      primaryContactEmail,
      primaryContactPhone,
      alternateContactName,
      alternateContactEmail,
      alternatePhone,
      
      // Admin Credentials
      adminEmail,
      adminPassword,
      
      // Academic Configuration
      academicYearStart,
      academicYearEnd,
      gradesOffered,
      sectionsPerGrade,
      gradingSystem,
      attendanceType,
      subjectsOffered,
      
      // Finance
      feeStructureType,
      billingContactEmail,
      paymentModes,
      bankName,
      accountNumber,
      ifscCode,
      taxId,
      
      // Group ID (from authenticated user)
      groupId
    } = req.body;

    // Validate required fields
    if (!schoolName || !schoolCode || !schoolType || !educationBoard) {
      return res.status(400).json({
        success: false,
        message: 'Missing required school fields'
      });
    }

    if (!adminEmail || !adminPassword) {
      return res.status(400).json({
        success: false,
        message: 'Admin email and password are required'
      });
    }

    const userGroupId = groupId || req.user?.groupId;
    if (!userGroupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Get group DB connection
    const dbClient = await getGroupDbClient(userGroupId);

    try {
      // Check if school code already exists in group database
      const existingSchoolCheck = await dbClient.query(
        `SELECT id FROM schools WHERE school_code = $1`,
        [schoolCode]
      );

      if (existingSchoolCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'School code already exists'
        });
      }

      // Check if admin email already exists in group database
      const existingAdminCheck = await dbClient.query(
        `SELECT id FROM school_admins WHERE email = $1`,
        [adminEmail]
      );

      if (existingAdminCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Admin email already exists'
        });
      }

      // Hash the admin password
      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      // Start transaction
      await dbClient.query('BEGIN');

      try {
        // Create school in group database
        const schoolResult = await dbClient.query(
          `INSERT INTO schools (
            school_name, school_code, school_type, education_board, academic_level,
            description, logo_url,
            address_line1, address_line2, city, district, state, country, pincode,
            primary_contact_name, primary_contact_role, primary_contact_email, primary_contact_phone,
            alternate_contact_name, alternate_contact_email, alternate_phone,
            academic_year_start, academic_year_end, grades_offered, sections_per_grade,
            grading_system, attendance_type, subjects_offered,
            fee_structure_type, billing_contact_email, payment_modes,
            bank_name, account_number, ifsc_code, tax_id,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)
          RETURNING id, school_name, school_code, status, created_at`,
          [
            schoolName, schoolCode, schoolType, educationBoard, academicLevel || [],
            description || null, logoUrl || null,
            addressLine1, addressLine2 || null, city, district || null, state, country || 'India', pincode,
            primaryContactName, primaryContactRole || null, primaryContactEmail, primaryContactPhone,
            alternateContactName || null, alternateContactEmail || null, alternatePhone || null,
            academicYearStart ? new Date(academicYearStart) : null,
            academicYearEnd ? new Date(academicYearEnd) : null,
            gradesOffered || [], sectionsPerGrade || [],
            gradingSystem || null, attendanceType || null, subjectsOffered || [],
            feeStructureType || null, billingContactEmail || null, paymentModes || [],
            bankName || null, accountNumber || null, ifscCode || null, taxId || null,
            'Active'
          ]
        );

        const school = schoolResult.rows[0];

        // Create school admin in group database
        const adminResult = await dbClient.query(
          `INSERT INTO school_admins (
            email, password, name, role, school_id, is_active, must_change_password, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          RETURNING id, email, name, role, must_change_password, created_at`,
          [
            adminEmail,
            hashedPassword,
            primaryContactName,
            primaryContactRole === 'Principal' ? 'principal' : 'admin',
            school.id,
            true,
            true
          ]
        );

        const schoolAdmin = adminResult.rows[0];

        // =====================================================
        // AUTO-CREATE CLASS GRADES from gradesOffered
        // =====================================================
        if (gradesOffered && gradesOffered.length > 0) {
          console.log(`Creating ${gradesOffered.length} class grades for school ${school.id}`);
          
          // Map grade names to numeric values
          const gradeNumericMap = {
            'Nursery': 0, 'LKG': 1, 'UKG': 2,
            'Class 1': 1, 'Class 2': 2, 'Class 3': 3, 'Class 4': 4, 'Class 5': 5,
            'Class 6': 6, 'Class 7': 7, 'Class 8': 8, 'Class 9': 9, 'Class 10': 10,
            'Class 11': 11, 'Class 12': 12
          };

          for (let i = 0; i < gradesOffered.length; i++) {
            const gradeName = gradesOffered[i];
            const numericValue = gradeNumericMap[gradeName] || (i + 1);
            
            await dbClient.query(
              `INSERT INTO class_grades (
                name, display_name, numeric_value, order_index, is_active, school_id, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
              ON CONFLICT (school_id, name, academic_session_id) DO NOTHING`,
              [gradeName, gradeName, numericValue, i, true, school.id]
            );
          }
        }

        // =====================================================
        // AUTO-CREATE SECTIONS from sectionsPerGrade
        // =====================================================
        if (sectionsPerGrade && sectionsPerGrade.length > 0) {
          console.log(`Creating ${sectionsPerGrade.length} sections for school ${school.id}`);
          
          for (let i = 0; i < sectionsPerGrade.length; i++) {
            const sectionName = sectionsPerGrade[i];
            
            await dbClient.query(
              `INSERT INTO sections (
                name, display_name, order_index, is_active, school_id, created_at, updated_at
              ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
              ON CONFLICT (school_id, name) DO NOTHING`,
              [sectionName, `Section ${sectionName}`, i, true, school.id]
            );
          }
        }

        // Commit transaction
        await dbClient.query('COMMIT');

        // Return success with school and admin details
        res.status(201).json({
          success: true,
          message: 'School onboarded successfully',
          data: {
            school: {
              id: school.id,
              schoolName: school.school_name,
              schoolCode: school.school_code,
              status: school.status
            },
            adminCredentials: {
              email: schoolAdmin.email,
              name: schoolAdmin.name,
              role: schoolAdmin.role,
              mustChangePassword: schoolAdmin.must_change_password,
              loginUrl: process.env.SCHOOL_PORTAL_URL || 'http://localhost:5002'
            }
          }
        });

      } catch (error) {
        await dbClient.query('ROLLBACK');
        throw error;
      }

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('School onboarding error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to onboard school',
      error: error.message
    });
  }
};

/**
 * Get all schools for a group
 * Now queries from group database instead of admin database
 */
export const getAllSchools = async (req, res) => {
  try {
    const { groupId } = req.query;
    const userGroupId = groupId || req.user?.groupId;

    if (!userGroupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Get group DB connection
    const dbClient = await getGroupDbClient(userGroupId);

    try {
      // Get all schools with counts
      const schoolsResult = await dbClient.query(
        `SELECT 
          s.*,
          (SELECT COUNT(*) FROM students st WHERE st.school_id = s.id) as student_count,
          (SELECT COUNT(*) FROM teachers t WHERE t.school_id = s.id) as teacher_count,
          (SELECT COUNT(*) FROM classes c WHERE c.school_id = s.id) as class_count
        FROM schools s
        ORDER BY s.created_at DESC`
      );

      // Get admin counts for each school
      for (const school of schoolsResult.rows) {
        const adminResult = await dbClient.query(
          `SELECT id, email, name, role, is_active, last_login, created_at
           FROM school_admins WHERE school_id = $1`,
          [school.id]
        );
        school.admins = adminResult.rows;
      }

      res.json({
        success: true,
        count: schoolsResult.rows.length,
        data: schoolsResult.rows.map(s => ({
          id: s.id,
          schoolName: s.school_name,
          schoolCode: s.school_code,
          schoolType: s.school_type,
          educationBoard: s.education_board,
          addressLine1: s.address_line1,
          city: s.city,
          state: s.state,
          status: s.status,
          _count: {
            students: parseInt(s.student_count) || 0,
            teachers: parseInt(s.teacher_count) || 0,
            classes: parseInt(s.class_count) || 0
          },
          admins: s.admins || []
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get schools error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch schools',
      error: error.message
    });
  }
};

/**
 * Get school by ID
 * Now queries from group database instead of admin database
 */
export const getSchoolById = async (req, res) => {
  try {
    const { id } = req.params;
    const groupId = req.user?.groupId;

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
        [id]
      );

      if (schoolResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'School not found'
        });
      }

      const school = schoolResult.rows[0];

      // Get school admins
      const adminsResult = await dbClient.query(
        `SELECT id, email, name, role, is_active, last_login, created_at
         FROM school_admins WHERE school_id = $1`,
        [id]
      );

      // Get counts
      const [studentsCount, teachersCount, classesCount] = await Promise.all([
        dbClient.query(`SELECT COUNT(*) as count FROM students WHERE school_id = $1`, [id]),
        dbClient.query(`SELECT COUNT(*) as count FROM teachers WHERE school_id = $1`, [id]),
        dbClient.query(`SELECT COUNT(*) as count FROM classes WHERE school_id = $1`, [id])
      ]);

      // Get sample students and teachers
      const [studentsResult, teachersResult, classesResult] = await Promise.all([
        dbClient.query(`SELECT id, first_name, last_name, admission_number, current_grade, status FROM students WHERE school_id = $1 LIMIT 10`, [id]),
        dbClient.query(`SELECT id, first_name, last_name, email, subjects, status FROM teachers WHERE school_id = $1 LIMIT 10`, [id]),
        dbClient.query(`SELECT id, grade, section, academic_year, (SELECT COUNT(*) FROM students WHERE class_id = classes.id) as student_count FROM classes WHERE school_id = $1`, [id])
      ]);

      res.json({
        success: true,
        data: {
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
          schoolAdmins: adminsResult.rows.map(a => ({
            id: a.id,
            email: a.email,
            name: a.name,
            role: a.role,
            isActive: a.is_active,
            lastLogin: a.last_login,
            createdAt: a.created_at
          })),
          students: studentsResult.rows.map(s => ({
            id: s.id,
            firstName: s.first_name,
            lastName: s.last_name,
            admissionNumber: s.admission_number,
            currentGrade: s.current_grade,
            status: s.status
          })),
          teachers: teachersResult.rows.map(t => ({
            id: t.id,
            firstName: t.first_name,
            lastName: t.last_name,
            email: t.email,
            subjects: t.subjects,
            status: t.status
          })),
          classes: classesResult.rows.map(c => ({
            id: c.id,
            grade: c.grade,
            section: c.section,
            academicYear: c.academic_year,
            _count: {
              students: parseInt(c.student_count) || 0
            }
          })),
          _count: {
            students: parseInt(studentsCount.rows[0].count) || 0,
            teachers: parseInt(teachersCount.rows[0].count) || 0,
            classes: parseInt(classesCount.rows[0].count) || 0
          }
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get school error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch school',
      error: error.message
    });
  }
};

/**
 * Update school
 * Now updates in group database instead of admin database
 */
export const updateSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const groupId = req.user?.groupId;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Remove fields that shouldn't be updated directly
    delete updateData.id;
    delete updateData.schoolCode; // School code shouldn't be changed
    delete updateData.groupId;

    // Get group DB connection
    const dbClient = await getGroupDbClient(groupId);

    try {
      // Build update query dynamically
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      // Map camelCase to snake_case for database
      const fieldMap = {
        schoolName: 'school_name',
        schoolType: 'school_type',
        educationBoard: 'education_board',
        academicLevel: 'academic_level',
        logoUrl: 'logo_url',
        addressLine1: 'address_line1',
        addressLine2: 'address_line2',
        primaryContactName: 'primary_contact_name',
        primaryContactRole: 'primary_contact_role',
        primaryContactEmail: 'primary_contact_email',
        primaryContactPhone: 'primary_contact_phone',
        alternateContactName: 'alternate_contact_name',
        alternateContactEmail: 'alternate_contact_email',
        alternatePhone: 'alternate_phone',
        academicYearStart: 'academic_year_start',
        academicYearEnd: 'academic_year_end',
        gradesOffered: 'grades_offered',
        sectionsPerGrade: 'sections_per_grade',
        gradingSystem: 'grading_system',
        attendanceType: 'attendance_type',
        subjectsOffered: 'subjects_offered',
        feeStructureType: 'fee_structure_type',
        billingContactEmail: 'billing_contact_email',
        paymentModes: 'payment_modes',
        bankName: 'bank_name',
        accountNumber: 'account_number',
        ifscCode: 'ifsc_code',
        taxId: 'tax_id'
      };

      for (const [key, value] of Object.entries(updateData)) {
        const dbField = fieldMap[key] || key;
        if (dbField !== 'id' && dbField !== 'school_code' && dbField !== 'created_at') {
          if (key.includes('Year') && value) {
            updateFields.push(`${dbField} = $${paramIndex}`);
            updateValues.push(new Date(value));
          } else {
            updateFields.push(`${dbField} = $${paramIndex}`);
            updateValues.push(value);
          }
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }

      updateFields.push(`updated_at = NOW()`);
      updateValues.push(id);

      const updateQuery = `
        UPDATE schools 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await dbClient.query(updateQuery, updateValues);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'School not found'
        });
      }

      res.json({
        success: true,
        message: 'School updated successfully',
        data: result.rows[0]
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update school error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update school',
      error: error.message
    });
  }
};

/**
 * Delete school
 * Now deletes from group database instead of admin database
 */
export const deleteSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const groupId = req.user?.groupId;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Get group DB connection
    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM schools WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'School not found'
        });
      }

      res.json({
        success: true,
        message: 'School deleted successfully'
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete school error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete school',
      error: error.message
    });
  }
};

/**
 * Sync class grades and sections for an existing school
 * Creates class_grades and sections from grades_offered and sections_per_grade
 */
export const syncSchoolClassConfig = async (req, res) => {
  try {
    const { id } = req.params;
    const groupId = req.query.groupId || req.user?.groupId;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Get group DB connection
    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get school details
      const schoolResult = await dbClient.query(
        `SELECT id, school_name, grades_offered, sections_per_grade FROM schools WHERE id = $1`,
        [id]
      );

      if (schoolResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'School not found'
        });
      }

      const school = schoolResult.rows[0];
      const gradesOffered = school.grades_offered || [];
      const sectionsPerGrade = school.sections_per_grade || [];

      let gradesCreated = 0;
      let sectionsCreated = 0;

      // Map grade names to numeric values
      const gradeNumericMap = {
        'Nursery': 0, 'LKG': 1, 'UKG': 2,
        'Class 1': 1, 'Class 2': 2, 'Class 3': 3, 'Class 4': 4, 'Class 5': 5,
        'Class 6': 6, 'Class 7': 7, 'Class 8': 8, 'Class 9': 9, 'Class 10': 10,
        'Class 11': 11, 'Class 12': 12
      };

      // Create class grades
      for (let i = 0; i < gradesOffered.length; i++) {
        const gradeName = gradesOffered[i];
        const numericValue = gradeNumericMap[gradeName] || (i + 1);
        
        const result = await dbClient.query(
          `INSERT INTO class_grades (
            name, display_name, numeric_value, order_index, is_active, school_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
          ON CONFLICT (school_id, name, academic_session_id) DO NOTHING
          RETURNING id`,
          [gradeName, gradeName, numericValue, i, true, school.id]
        );
        
        if (result.rows.length > 0) {
          gradesCreated++;
        }
      }

      // Create sections
      for (let i = 0; i < sectionsPerGrade.length; i++) {
        const sectionName = sectionsPerGrade[i];
        
        const result = await dbClient.query(
          `INSERT INTO sections (
            name, display_name, order_index, is_active, school_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          ON CONFLICT (school_id, name) DO NOTHING
          RETURNING id`,
          [sectionName, `Section ${sectionName}`, i, true, school.id]
        );
        
        if (result.rows.length > 0) {
          sectionsCreated++;
        }
      }

      res.json({
        success: true,
        message: `Synced class configuration for ${school.school_name}`,
        data: {
          schoolId: school.id,
          schoolName: school.school_name,
          gradesConfigured: gradesOffered.length,
          sectionsConfigured: sectionsPerGrade.length,
          gradesCreated,
          sectionsCreated
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Sync class config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync class configuration',
      error: error.message
    });
  }
};

/**
 * Sync class grades and sections for ALL schools in a group
 */
export const syncAllSchoolsClassConfig = async (req, res) => {
  try {
    const groupId = req.query.groupId || req.user?.groupId;

    if (!groupId) {
      return res.status(400).json({
        success: false,
        message: 'Group ID is required'
      });
    }

    // Get group DB connection
    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get all schools
      const schoolsResult = await dbClient.query(
        `SELECT id, school_name, grades_offered, sections_per_grade FROM schools`
      );

      const results = [];

      // Map grade names to numeric values
      const gradeNumericMap = {
        'Nursery': 0, 'LKG': 1, 'UKG': 2,
        'Class 1': 1, 'Class 2': 2, 'Class 3': 3, 'Class 4': 4, 'Class 5': 5,
        'Class 6': 6, 'Class 7': 7, 'Class 8': 8, 'Class 9': 9, 'Class 10': 10,
        'Class 11': 11, 'Class 12': 12
      };

      for (const school of schoolsResult.rows) {
        const gradesOffered = school.grades_offered || [];
        const sectionsPerGrade = school.sections_per_grade || [];

        let gradesCreated = 0;
        let sectionsCreated = 0;

        // Create class grades
        for (let i = 0; i < gradesOffered.length; i++) {
          const gradeName = gradesOffered[i];
          const numericValue = gradeNumericMap[gradeName] || (i + 1);
          
          const result = await dbClient.query(
            `INSERT INTO class_grades (
              name, display_name, numeric_value, order_index, is_active, school_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            ON CONFLICT (school_id, name, academic_session_id) DO NOTHING
            RETURNING id`,
            [gradeName, gradeName, numericValue, i, true, school.id]
          );
          
          if (result.rows.length > 0) {
            gradesCreated++;
          }
        }

        // Create sections
        for (let i = 0; i < sectionsPerGrade.length; i++) {
          const sectionName = sectionsPerGrade[i];
          
          const result = await dbClient.query(
            `INSERT INTO sections (
              name, display_name, order_index, is_active, school_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
            ON CONFLICT (school_id, name) DO NOTHING
            RETURNING id`,
            [sectionName, `Section ${sectionName}`, i, true, school.id]
          );
          
          if (result.rows.length > 0) {
            sectionsCreated++;
          }
        }

        results.push({
          schoolId: school.id,
          schoolName: school.school_name,
          gradesConfigured: gradesOffered.length,
          sectionsConfigured: sectionsPerGrade.length,
          gradesCreated,
          sectionsCreated
        });
      }

      res.json({
        success: true,
        message: `Synced class configuration for ${results.length} schools`,
        data: results
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Sync all schools class config error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync class configurations',
      error: error.message
    });
  }
};
