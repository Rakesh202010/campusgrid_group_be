import { getGroupDbClient } from '../lib/groupDb.js';

// Get all students with filters
export const getStudents = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { 
      academic_session_id, 
      class_section_id, 
      class_grade_id,
      status = 'active',
      search,
      page = 1,
      limit = 50 
    } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT 
          s.*,
          cs.id as class_section_id,
          cg.name as grade_name, cg.display_name as grade_display_name,
          sec.name as section_name,
          acs.name as session_name,
          (SELECT COUNT(*) FROM student_parents sp WHERE sp.student_id = s.id) as parent_count
        FROM students s
        LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        LEFT JOIN academic_sessions acs ON s.academic_session_id = acs.id
        WHERE s.school_id = $1
      `;
      const params = [schoolId];
      let paramIndex = 2;

      if (academic_session_id) {
        query += ` AND s.academic_session_id = $${paramIndex}`;
        params.push(academic_session_id);
        paramIndex++;
      }

      if (class_section_id) {
        query += ` AND s.current_class_section_id = $${paramIndex}`;
        params.push(class_section_id);
        paramIndex++;
      }

      if (class_grade_id) {
        query += ` AND cs.class_grade_id = $${paramIndex}`;
        params.push(class_grade_id);
        paramIndex++;
      }

      if (status && status !== 'all') {
        query += ` AND s.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (search) {
        query += ` AND (
          s.first_name ILIKE $${paramIndex} OR 
          s.last_name ILIKE $${paramIndex} OR 
          s.admission_number ILIKE $${paramIndex} OR
          s.phone ILIKE $${paramIndex} OR
          s.email ILIKE $${paramIndex}
        )`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Get total count
      const countQuery = query.replace(/SELECT[\s\S]*?FROM students/, 'SELECT COUNT(*) as total FROM students');
      const countResult = await dbClient.query(countQuery, params);
      const total = parseInt(countResult.rows[0]?.total || 0);

      // Add pagination and sorting
      const offset = (parseInt(page) - 1) * parseInt(limit);
      query += ` ORDER BY cg.order_index ASC, cg.numeric_value ASC, s.roll_number ASC, s.first_name ASC`;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), offset);

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          admissionNumber: row.admission_number,
          admissionDate: row.admission_date,
          rollNumber: row.roll_number,
          firstName: row.first_name,
          middleName: row.middle_name,
          lastName: row.last_name,
          fullName: `${row.first_name} ${row.middle_name || ''} ${row.last_name}`.replace(/\s+/g, ' ').trim(),
          dateOfBirth: row.date_of_birth,
          gender: row.gender,
          bloodGroup: row.blood_group,
          nationality: row.nationality,
          religion: row.religion,
          caste: row.caste,
          category: row.category,
          email: row.email,
          phone: row.phone,
          alternatePhone: row.alternate_phone,
          address: {
            line1: row.address_line1,
            line2: row.address_line2,
            city: row.city,
            state: row.state,
            pincode: row.pincode,
            country: row.country
          },
          aadharNumber: row.aadhar_number,
          medicalConditions: row.medical_conditions,
          allergies: row.allergies,
          usesTransport: row.uses_transport,
          pickupPoint: row.pickup_point,
          previousSchool: {
            name: row.previous_school_name,
            address: row.previous_school_address,
            class: row.previous_class,
            tcNumber: row.transfer_certificate_number
          },
          status: row.status,
          photoUrl: row.photo_url,
          classSectionId: row.current_class_section_id,
          className: row.grade_display_name ? `${row.grade_display_name} - ${row.section_name}` : null,
          gradeName: row.grade_display_name,
          sectionName: row.section_name,
          sessionName: row.session_name,
          academicSessionId: row.academic_session_id,
          parentCount: parseInt(row.parent_count) || 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting students:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch students.' });
  }
};

// Get single student with full details
export const getStudentById = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get student details
      const studentQuery = `
        SELECT 
          s.*,
          cs.id as class_section_id,
          cg.name as grade_name, cg.display_name as grade_display_name,
          sec.name as section_name,
          acs.name as session_name
        FROM students s
        LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        LEFT JOIN academic_sessions acs ON s.academic_session_id = acs.id
        WHERE s.id = $1 AND s.school_id = $2
      `;
      const studentResult = await dbClient.query(studentQuery, [id, schoolId]);

      if (studentResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      const row = studentResult.rows[0];

      // Get parents (using junction table with parents table)
      const parentsResult = await dbClient.query(
        `SELECT p.*, sp.relationship, sp.is_primary, sp.is_guardian
         FROM student_parents sp
         JOIN parents p ON sp.parent_id = p.id
         WHERE sp.student_id = $1
         ORDER BY sp.is_primary DESC, sp.relationship`,
        [id]
      );

      // Get documents (table may not exist, handle gracefully)
      let documentsResult = { rows: [] };
      try {
        documentsResult = await dbClient.query(
          `SELECT * FROM student_documents WHERE student_id = $1 ORDER BY created_at DESC`,
          [id]
        );
      } catch (e) {
        // Table may not exist
      }

      // Get class history (table may not exist, handle gracefully)
      let historyResult = { rows: [] };
      try {
        historyResult = await dbClient.query(
          `SELECT sch.*, acs.name as session_name, cg.display_name as grade_name, sec.name as section_name
           FROM student_class_history sch
           LEFT JOIN academic_sessions acs ON sch.academic_session_id = acs.id
           LEFT JOIN class_sections cs ON sch.class_section_id = cs.id
           LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
           LEFT JOIN sections sec ON cs.section_id = sec.id
           WHERE sch.student_id = $1
           ORDER BY sch.start_date DESC`,
          [id]
        );
      } catch (e) {
        // Table may not exist
      }

      res.json({
        success: true,
        data: {
          id: row.id,
          admissionNumber: row.admission_number,
          admissionDate: row.admission_date,
          rollNumber: row.roll_number,
          firstName: row.first_name,
          middleName: row.middle_name,
          lastName: row.last_name,
          fullName: `${row.first_name} ${row.middle_name || ''} ${row.last_name}`.replace(/\s+/g, ' ').trim(),
          dateOfBirth: row.date_of_birth,
          gender: row.gender,
          bloodGroup: row.blood_group,
          nationality: row.nationality,
          religion: row.religion,
          caste: row.caste,
          category: row.category,
          email: row.email,
          phone: row.phone,
          alternatePhone: row.alternate_phone,
          address: {
            line1: row.address_line1,
            line2: row.address_line2,
            city: row.city,
            state: row.state,
            pincode: row.pincode,
            country: row.country
          },
          aadharNumber: row.aadhar_number,
          medicalConditions: row.medical_conditions,
          allergies: row.allergies,
          usesTransport: row.uses_transport,
          pickupPoint: row.pickup_point,
          previousSchool: {
            name: row.previous_school_name,
            address: row.previous_school_address,
            class: row.previous_class,
            tcNumber: row.transfer_certificate_number
          },
          status: row.status,
          photoUrl: row.photo_url,
          classSectionId: row.current_class_section_id,
          className: row.grade_display_name ? `${row.grade_display_name} - ${row.section_name}` : null,
          gradeName: row.grade_display_name,
          sectionName: row.section_name,
          sessionName: row.session_name,
          academicSessionId: row.academic_session_id,
          parents: parentsResult.rows.map(p => ({
            id: p.id,
            relationship: p.relationship || p.parent_type,
            isPrimaryContact: p.is_primary,
            firstName: p.first_name,
            lastName: p.last_name,
            fullName: `${p.first_name} ${p.last_name || ''}`.trim(),
            occupation: p.occupation,
            education: p.education,
            annualIncome: p.annual_income,
            email: p.email,
            phone: p.phone,
            alternatePhone: p.alternate_phone,
            address: p.address,
            city: p.city,
            state: p.state,
            pincode: p.pincode
          })),
          documents: documentsResult.rows.map(d => ({
            id: d.id,
            documentType: d.document_type,
            documentName: d.document_name,
            fileUrl: d.file_url,
            verified: d.verified,
            verifiedAt: d.verified_at
          })),
          classHistory: historyResult.rows.map(h => ({
            id: h.id,
            sessionName: h.session_name,
            className: `${h.grade_name} - ${h.section_name}`,
            rollNumber: h.roll_number,
            startDate: h.start_date,
            endDate: h.end_date,
            reason: h.reason,
            remarks: h.remarks
          })),
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting student:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch student details.' });
  }
};

// Create new student
export const createStudent = async (req, res) => {
  try {
    const { groupId, schoolId, userId } = req.user;
    const {
      admissionNumber,
      admissionDate,
      classSectionId,
      rollNumber,
      academicSessionId,
      firstName,
      middleName,
      lastName,
      dateOfBirth,
      gender,
      bloodGroup,
      nationality,
      religion,
      caste,
      category,
      email,
      phone,
      alternatePhone,
      address,
      aadharNumber,
      medicalConditions,
      allergies,
      usesTransport,
      pickupPoint,
      previousSchool,
      photoUrl,
      parents,
      // Fee Settings
      paymentFrequency,
      customFeeStructureId
    } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'First name and last name are required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query('BEGIN');

      // Check for duplicate admission number
      if (admissionNumber) {
        const dupCheck = await dbClient.query(
          'SELECT id FROM students WHERE admission_number = $1 AND school_id = $2',
          [admissionNumber, schoolId]
        );
        if (dupCheck.rows.length > 0) {
          await dbClient.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Admission number already exists.' });
        }
      }

      // Get admission class from class section if provided
      let admissionClassId = null;
      if (classSectionId) {
        const classCheck = await dbClient.query(
          'SELECT class_grade_id FROM class_sections WHERE id = $1',
          [classSectionId]
        );
        if (classCheck.rows.length > 0) {
          admissionClassId = classCheck.rows[0].class_grade_id;
        }
      }

      // Insert student
      const studentResult = await dbClient.query(`
        INSERT INTO students (
          school_id, academic_session_id, admission_number, admission_date, admission_class_id,
          current_class_section_id, roll_number,
          first_name, middle_name, last_name, date_of_birth, gender, blood_group,
          nationality, religion, caste, category,
          email, phone, alternate_phone,
          address_line1, address_line2, city, state, pincode, country,
          aadhar_number, medical_conditions, allergies,
          uses_transport, pickup_point,
          previous_school_name, previous_school_address, previous_class, transfer_certificate_number,
          photo_url, payment_frequency, custom_fee_structure_id, status, created_by
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
          $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, 'active', $39
        ) RETURNING *
      `, [
        schoolId,
        academicSessionId || null,
        admissionNumber || null,
        admissionDate || null,
        admissionClassId,
        classSectionId || null,
        rollNumber || null,
        firstName,
        middleName || null,
        lastName,
        dateOfBirth || null,
        gender || null,
        bloodGroup || null,
        nationality || 'Indian',
        religion || null,
        caste || null,
        category || null,
        email || null,
        phone || null,
        alternatePhone || null,
        address?.line1 || null,
        address?.line2 || null,
        address?.city || null,
        address?.state || null,
        address?.pincode || null,
        address?.country || 'India',
        aadharNumber || null,
        medicalConditions || null,
        allergies || null,
        usesTransport || false,
        pickupPoint || null,
        previousSchool?.name || null,
        previousSchool?.address || null,
        previousSchool?.class || null,
        previousSchool?.tcNumber || null,
        photoUrl || null,
        paymentFrequency || null,
        customFeeStructureId || null,
        userId
      ]);

      const studentId = studentResult.rows[0].id;

      // Insert parents if provided
      if (parents && Array.isArray(parents) && parents.length > 0) {
        for (const parent of parents) {
          await dbClient.query(`
            INSERT INTO student_parents (
              student_id, school_id, relationship, is_primary_contact,
              first_name, last_name, occupation, qualification, annual_income,
              email, phone, alternate_phone,
              same_as_student_address, address_line1, address_line2, city, state, pincode,
              office_name, office_address, office_phone, aadhar_number
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
          `, [
            studentId,
            schoolId,
            parent.relationship || 'guardian',
            parent.isPrimaryContact || false,
            parent.firstName,
            parent.lastName || null,
            parent.occupation || null,
            parent.qualification || null,
            parent.annualIncome || null,
            parent.email || null,
            parent.phone,
            parent.alternatePhone || null,
            parent.sameAsStudentAddress !== false,
            parent.address?.line1 || null,
            parent.address?.line2 || null,
            parent.address?.city || null,
            parent.address?.state || null,
            parent.address?.pincode || null,
            parent.officeName || null,
            parent.officeAddress || null,
            parent.officePhone || null,
            parent.aadharNumber || null
          ]);
        }
      }

      // Add to class history
      if (classSectionId && academicSessionId) {
        await dbClient.query(`
          INSERT INTO student_class_history (
            student_id, school_id, academic_session_id, class_section_id, roll_number,
            start_date, reason, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, 'admission', $7)
        `, [studentId, schoolId, academicSessionId, classSectionId, rollNumber, admissionDate || new Date(), userId]);
      }

      await dbClient.query('COMMIT');

      res.status(201).json({
        success: true,
        message: 'Student created successfully.',
        data: { id: studentId, admissionNumber }
      });
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error creating student:', error);
    res.status(500).json({ success: false, message: 'Failed to create student.' });
  }
};

// Update student
export const updateStudent = async (req, res) => {
  try {
    const { groupId, schoolId, userId } = req.user;
    const { id } = req.params;
    const updateData = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if student exists
      const existCheck = await dbClient.query(
        'SELECT id, admission_number FROM students WHERE id = $1 AND school_id = $2',
        [id, schoolId]
      );

      if (existCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      // Check for duplicate admission number
      if (updateData.admissionNumber && updateData.admissionNumber !== existCheck.rows[0].admission_number) {
        const dupCheck = await dbClient.query(
          'SELECT id FROM students WHERE admission_number = $1 AND school_id = $2 AND id != $3',
          [updateData.admissionNumber, schoolId, id]
        );
        if (dupCheck.rows.length > 0) {
          return res.status(400).json({ success: false, message: 'Admission number already exists.' });
        }
      }

      // Build update query
      const updates = [];
      const values = [];
      let valueIndex = 1;

      const fieldMapping = {
        admissionNumber: 'admission_number',
        admissionDate: 'admission_date',
        classSectionId: 'current_class_section_id',
        rollNumber: 'roll_number',
        academicSessionId: 'academic_session_id',
        firstName: 'first_name',
        middleName: 'middle_name',
        lastName: 'last_name',
        dateOfBirth: 'date_of_birth',
        gender: 'gender',
        bloodGroup: 'blood_group',
        nationality: 'nationality',
        religion: 'religion',
        caste: 'caste',
        category: 'category',
        email: 'email',
        phone: 'phone',
        alternatePhone: 'alternate_phone',
        aadharNumber: 'aadhar_number',
        medicalConditions: 'medical_conditions',
        allergies: 'allergies',
        usesTransport: 'uses_transport',
        pickupPoint: 'pickup_point',
        photoUrl: 'photo_url',
        status: 'status',
        // Fee Settings
        paymentFrequency: 'payment_frequency',
        customFeeStructureId: 'custom_fee_structure_id'
      };

      for (const [key, column] of Object.entries(fieldMapping)) {
        if (updateData[key] !== undefined) {
          updates.push(`${column} = $${valueIndex}`);
          values.push(updateData[key]);
          valueIndex++;
        }
      }

      // Handle address
      if (updateData.address) {
        const addressFields = {
          'address_line1': updateData.address.line1,
          'address_line2': updateData.address.line2,
          'city': updateData.address.city,
          'state': updateData.address.state,
          'pincode': updateData.address.pincode,
          'country': updateData.address.country
        };
        for (const [column, value] of Object.entries(addressFields)) {
          if (value !== undefined) {
            updates.push(`${column} = $${valueIndex}`);
            values.push(value);
            valueIndex++;
          }
        }
      }

      // Handle previous school
      if (updateData.previousSchool) {
        const prevSchoolFields = {
          'previous_school_name': updateData.previousSchool.name,
          'previous_school_address': updateData.previousSchool.address,
          'previous_class': updateData.previousSchool.class,
          'transfer_certificate_number': updateData.previousSchool.tcNumber
        };
        for (const [column, value] of Object.entries(prevSchoolFields)) {
          if (value !== undefined) {
            updates.push(`${column} = $${valueIndex}`);
            values.push(value);
            valueIndex++;
          }
        }
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      updates.push(`updated_by = $${valueIndex}`);
      values.push(userId);
      valueIndex++;

      values.push(id);
      values.push(schoolId);

      const query = `
        UPDATE students 
        SET ${updates.join(', ')}
        WHERE id = $${valueIndex} AND school_id = $${valueIndex + 1}
        RETURNING *
      `;

      await dbClient.query(query, values);

      res.json({
        success: true,
        message: 'Student updated successfully.'
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error updating student:', error);
    res.status(500).json({ success: false, message: 'Failed to update student.' });
  }
};

// Delete student (soft delete - change status)
export const deleteStudent = async (req, res) => {
  try {
    const { groupId, schoolId, userId } = req.user;
    const { id } = req.params;
    const { permanent } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      if (permanent === 'true') {
        // Hard delete
        await dbClient.query('DELETE FROM student_documents WHERE student_id = $1', [id]);
        await dbClient.query('DELETE FROM student_parents WHERE student_id = $1', [id]);
        await dbClient.query('DELETE FROM student_class_history WHERE student_id = $1', [id]);
        await dbClient.query('DELETE FROM students WHERE id = $1 AND school_id = $2', [id, schoolId]);
      } else {
        // Soft delete
        await dbClient.query(
          `UPDATE students SET status = 'inactive', updated_at = CURRENT_TIMESTAMP, updated_by = $1 
           WHERE id = $2 AND school_id = $3`,
          [userId, id, schoolId]
        );
      }

      res.json({
        success: true,
        message: permanent === 'true' ? 'Student permanently deleted.' : 'Student deactivated.'
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error deleting student:', error);
    res.status(500).json({ success: false, message: 'Failed to delete student.' });
  }
};

// Get class-wise student count
export const getStudentStats = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Overall stats
      const statsQuery = `
        SELECT 
          COUNT(*) FILTER (WHERE status = 'active') as active_count,
          COUNT(*) FILTER (WHERE status = 'inactive') as inactive_count,
          COUNT(*) FILTER (WHERE status = 'transferred') as transferred_count,
          COUNT(*) FILTER (WHERE status = 'passed_out') as passed_out_count,
          COUNT(*) FILTER (WHERE gender = 'male' AND status = 'active') as male_count,
          COUNT(*) FILTER (WHERE gender = 'female' AND status = 'active') as female_count,
          COUNT(*) as total_count
        FROM students
        WHERE school_id = $1 ${academic_session_id ? 'AND academic_session_id = $2' : ''}
      `;
      const statsParams = academic_session_id ? [schoolId, academic_session_id] : [schoolId];
      const statsResult = await dbClient.query(statsQuery, statsParams);

      // Class-wise count
      const classWiseQuery = `
        SELECT 
          cg.display_name as class_name,
          COUNT(s.id) as student_count
        FROM students s
        INNER JOIN class_sections cs ON s.current_class_section_id = cs.id
        INNER JOIN class_grades cg ON cs.class_grade_id = cg.id
        WHERE s.school_id = $1 AND s.status = 'active'
        ${academic_session_id ? 'AND s.academic_session_id = $2' : ''}
        GROUP BY cg.id, cg.display_name, cg.order_index, cg.numeric_value
        ORDER BY cg.order_index, cg.numeric_value
      `;
      const classWiseResult = await dbClient.query(classWiseQuery, statsParams);

      res.json({
        success: true,
        data: {
          summary: {
            total: parseInt(statsResult.rows[0]?.total_count) || 0,
            active: parseInt(statsResult.rows[0]?.active_count) || 0,
            inactive: parseInt(statsResult.rows[0]?.inactive_count) || 0,
            transferred: parseInt(statsResult.rows[0]?.transferred_count) || 0,
            passedOut: parseInt(statsResult.rows[0]?.passed_out_count) || 0,
            male: parseInt(statsResult.rows[0]?.male_count) || 0,
            female: parseInt(statsResult.rows[0]?.female_count) || 0
          },
          classWise: classWiseResult.rows.map(r => ({
            className: r.class_name,
            count: parseInt(r.student_count) || 0
          }))
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting student stats:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch student statistics.' });
  }
};

// Add/Update parent
export const upsertParent = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { studentId } = req.params;
    const parentData = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Verify student exists
      const studentCheck = await dbClient.query(
        'SELECT id FROM students WHERE id = $1 AND school_id = $2',
        [studentId, schoolId]
      );

      if (studentCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      if (parentData.id) {
        // Update existing parent
        await dbClient.query(`
          UPDATE student_parents SET
            relationship = $1, is_primary_contact = $2,
            first_name = $3, last_name = $4, occupation = $5, qualification = $6, annual_income = $7,
            email = $8, phone = $9, alternate_phone = $10,
            same_as_student_address = $11, address_line1 = $12, address_line2 = $13, 
            city = $14, state = $15, pincode = $16,
            office_name = $17, office_address = $18, office_phone = $19, aadhar_number = $20,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $21 AND student_id = $22
        `, [
          parentData.relationship,
          parentData.isPrimaryContact || false,
          parentData.firstName,
          parentData.lastName || null,
          parentData.occupation || null,
          parentData.qualification || null,
          parentData.annualIncome || null,
          parentData.email || null,
          parentData.phone,
          parentData.alternatePhone || null,
          parentData.sameAsStudentAddress !== false,
          parentData.address?.line1 || null,
          parentData.address?.line2 || null,
          parentData.address?.city || null,
          parentData.address?.state || null,
          parentData.address?.pincode || null,
          parentData.officeName || null,
          parentData.officeAddress || null,
          parentData.officePhone || null,
          parentData.aadharNumber || null,
          parentData.id,
          studentId
        ]);
      } else {
        // Insert new parent
        await dbClient.query(`
          INSERT INTO student_parents (
            student_id, school_id, relationship, is_primary_contact,
            first_name, last_name, occupation, qualification, annual_income,
            email, phone, alternate_phone,
            same_as_student_address, address_line1, address_line2, city, state, pincode,
            office_name, office_address, office_phone, aadhar_number
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        `, [
          studentId,
          schoolId,
          parentData.relationship || 'guardian',
          parentData.isPrimaryContact || false,
          parentData.firstName,
          parentData.lastName || null,
          parentData.occupation || null,
          parentData.qualification || null,
          parentData.annualIncome || null,
          parentData.email || null,
          parentData.phone,
          parentData.alternatePhone || null,
          parentData.sameAsStudentAddress !== false,
          parentData.address?.line1 || null,
          parentData.address?.line2 || null,
          parentData.address?.city || null,
          parentData.address?.state || null,
          parentData.address?.pincode || null,
          parentData.officeName || null,
          parentData.officeAddress || null,
          parentData.officePhone || null,
          parentData.aadharNumber || null
        ]);
      }

      res.json({
        success: true,
        message: parentData.id ? 'Parent updated successfully.' : 'Parent added successfully.'
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error saving parent:', error);
    res.status(500).json({ success: false, message: 'Failed to save parent information.' });
  }
};

// Delete parent
export const deleteParent = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { studentId, parentId } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(
        'DELETE FROM student_parents WHERE id = $1 AND student_id = $2 AND school_id = $3',
        [parentId, studentId, schoolId]
      );

      res.json({ success: true, message: 'Parent removed successfully.' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error deleting parent:', error);
    res.status(500).json({ success: false, message: 'Failed to remove parent.' });
  }
};

// Promote students to next class
export const promoteStudents = async (req, res) => {
  try {
    const { groupId, schoolId, userId } = req.user;
    const { 
      fromSessionId, 
      toSessionId, 
      fromClassSectionId, 
      toClassSectionId, 
      studentIds 
    } = req.body;

    if (!toSessionId || !toClassSectionId || !studentIds || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Missing required fields for promotion.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query('BEGIN');

      for (const studentId of studentIds) {
        // Update student's class
        await dbClient.query(`
          UPDATE students SET 
            academic_session_id = $1,
            current_class_section_id = $2,
            roll_number = NULL,
            updated_at = CURRENT_TIMESTAMP,
            updated_by = $3
          WHERE id = $4 AND school_id = $5
        `, [toSessionId, toClassSectionId, userId, studentId, schoolId]);

        // Close previous class history
        if (fromSessionId && fromClassSectionId) {
          await dbClient.query(`
            UPDATE student_class_history SET 
              end_date = CURRENT_DATE,
              reason = 'promotion'
            WHERE student_id = $1 AND academic_session_id = $2 AND class_section_id = $3 AND end_date IS NULL
          `, [studentId, fromSessionId, fromClassSectionId]);
        }

        // Add new class history
        await dbClient.query(`
          INSERT INTO student_class_history (
            student_id, school_id, academic_session_id, class_section_id,
            start_date, reason, created_by
          ) VALUES ($1, $2, $3, $4, CURRENT_DATE, 'promotion', $5)
        `, [studentId, schoolId, toSessionId, toClassSectionId, userId]);
      }

      await dbClient.query('COMMIT');

      res.json({
        success: true,
        message: `${studentIds.length} students promoted successfully.`
      });
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error promoting students:', error);
    res.status(500).json({ success: false, message: 'Failed to promote students.' });
  }
};

// Generate next admission number
export const getNextAdmissionNumber = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { prefix = 'ADM' } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(`
        SELECT admission_number FROM students 
        WHERE school_id = $1 AND admission_number LIKE $2
        ORDER BY admission_number DESC LIMIT 1
      `, [schoolId, `${prefix}%`]);

      let nextNumber = 1;
      if (result.rows.length > 0) {
        const lastNumber = result.rows[0].admission_number.replace(prefix, '');
        nextNumber = parseInt(lastNumber) + 1 || 1;
      }

      const nextAdmissionNumber = `${prefix}${String(nextNumber).padStart(5, '0')}`;

      res.json({
        success: true,
        data: { nextAdmissionNumber }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error generating admission number:', error);
    res.status(500).json({ success: false, message: 'Failed to generate admission number.' });
  }
};

// Export students to CSV
export const exportStudents = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, class_section_id, class_grade_id, status = 'active' } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT 
          s.admission_number, s.roll_number,
          s.first_name, s.middle_name, s.last_name,
          s.date_of_birth, s.gender, s.blood_group,
          s.nationality, s.religion, s.caste, s.category,
          s.email, s.phone, s.alternate_phone,
          s.address_line1, s.address_line2, s.city, s.state, s.pincode, s.country,
          s.aadhar_number, s.medical_conditions, s.allergies,
          s.uses_transport, s.pickup_point,
          s.previous_school_name, s.previous_class,
          s.status, s.admission_date,
          cg.display_name as class_name, sec.name as section_name,
          -- Father info
          (SELECT p.first_name || ' ' || COALESCE(p.last_name, '') FROM parents p 
           JOIN student_parents sp ON sp.parent_id = p.id 
           WHERE sp.student_id = s.id AND p.parent_type = 'father' LIMIT 1) as father_name,
          (SELECT p.phone FROM parents p 
           JOIN student_parents sp ON sp.parent_id = p.id 
           WHERE sp.student_id = s.id AND p.parent_type = 'father' LIMIT 1) as father_phone,
          (SELECT p.occupation FROM parents p 
           JOIN student_parents sp ON sp.parent_id = p.id 
           WHERE sp.student_id = s.id AND p.parent_type = 'father' LIMIT 1) as father_occupation,
          -- Mother info
          (SELECT p.first_name || ' ' || COALESCE(p.last_name, '') FROM parents p 
           JOIN student_parents sp ON sp.parent_id = p.id 
           WHERE sp.student_id = s.id AND p.parent_type = 'mother' LIMIT 1) as mother_name,
          (SELECT p.phone FROM parents p 
           JOIN student_parents sp ON sp.parent_id = p.id 
           WHERE sp.student_id = s.id AND p.parent_type = 'mother' LIMIT 1) as mother_phone,
          (SELECT p.occupation FROM parents p 
           JOIN student_parents sp ON sp.parent_id = p.id 
           WHERE sp.student_id = s.id AND p.parent_type = 'mother' LIMIT 1) as mother_occupation
        FROM students s
        LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        WHERE s.school_id = $1
      `;
      const params = [schoolId];
      let paramIndex = 2;

      if (academic_session_id) {
        query += ` AND s.academic_session_id = $${paramIndex}`;
        params.push(academic_session_id);
        paramIndex++;
      }

      if (class_section_id) {
        query += ` AND s.current_class_section_id = $${paramIndex}`;
        params.push(class_section_id);
        paramIndex++;
      }

      if (class_grade_id) {
        query += ` AND cs.class_grade_id = $${paramIndex}`;
        params.push(class_grade_id);
        paramIndex++;
      }

      if (status && status !== 'all') {
        query += ` AND s.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY cg.order_index, cg.numeric_value, s.roll_number, s.first_name`;

      const result = await dbClient.query(query, params);

      // Convert to CSV
      const headers = [
        'Admission Number', 'Roll Number', 'First Name', 'Middle Name', 'Last Name',
        'Date of Birth', 'Gender', 'Blood Group', 'Nationality', 'Religion', 'Caste', 'Category',
        'Email', 'Phone', 'Alternate Phone',
        'Address Line 1', 'Address Line 2', 'City', 'State', 'Pincode', 'Country',
        'Aadhar Number', 'Medical Conditions', 'Allergies',
        'Uses Transport', 'Pickup Point', 'Previous School', 'Previous Class',
        'Status', 'Admission Date', 'Class', 'Section',
        'Father Name', 'Father Phone', 'Father Occupation',
        'Mother Name', 'Mother Phone', 'Mother Occupation'
      ];

      const csvRows = [headers.join(',')];
      
      for (const row of result.rows) {
        const values = [
          row.admission_number || '',
          row.roll_number || '',
          row.first_name || '',
          row.middle_name || '',
          row.last_name || '',
          row.date_of_birth ? new Date(row.date_of_birth).toISOString().split('T')[0] : '',
          row.gender || '',
          row.blood_group || '',
          row.nationality || '',
          row.religion || '',
          row.caste || '',
          row.category || '',
          row.email || '',
          row.phone || '',
          row.alternate_phone || '',
          (row.address_line1 || '').replace(/,/g, ';'),
          (row.address_line2 || '').replace(/,/g, ';'),
          row.city || '',
          row.state || '',
          row.pincode || '',
          row.country || '',
          row.aadhar_number || '',
          (row.medical_conditions || '').replace(/,/g, ';'),
          (row.allergies || '').replace(/,/g, ';'),
          row.uses_transport ? 'Yes' : 'No',
          row.pickup_point || '',
          (row.previous_school_name || '').replace(/,/g, ';'),
          row.previous_class || '',
          row.status || '',
          row.admission_date ? new Date(row.admission_date).toISOString().split('T')[0] : '',
          row.class_name || '',
          row.section_name || '',
          (row.father_name || '').trim(),
          row.father_phone || '',
          row.father_occupation || '',
          (row.mother_name || '').trim(),
          row.mother_phone || '',
          row.mother_occupation || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`);
        
        csvRows.push(values.join(','));
      }

      const csv = csvRows.join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=students_export_${new Date().toISOString().split('T')[0]}.csv`);
      res.send(csv);
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error exporting students:', error);
    res.status(500).json({ success: false, message: 'Failed to export students.' });
  }
};

// Get import template
export const getImportTemplate = async (req, res) => {
  try {
    const headers = [
      'Admission Number*', 'Roll Number', 'First Name*', 'Middle Name', 'Last Name*',
      'Date of Birth (YYYY-MM-DD)', 'Gender (male/female/other)', 'Blood Group',
      'Nationality', 'Religion', 'Caste', 'Category (General/OBC/SC/ST/EWS)',
      'Email', 'Phone', 'Alternate Phone',
      'Address Line 1', 'Address Line 2', 'City', 'State', 'Pincode', 'Country',
      'Aadhar Number', 'Medical Conditions', 'Allergies',
      'Uses Transport (Yes/No)', 'Pickup Point', 'Previous School', 'Previous Class',
      'Father Name', 'Father Phone', 'Father Occupation',
      'Mother Name', 'Mother Phone', 'Mother Occupation'
    ];

    // Sample row
    const sampleRow = [
      'ADM00001', '1', 'Rahul', '', 'Sharma',
      '2015-05-15', 'male', 'A+',
      'Indian', 'Hindu', '', 'General',
      'rahul@email.com', '+919876543210', '',
      '123 Main Street', 'Near Park', 'Delhi', 'Delhi', '110001', 'India',
      '123456789012', '', '',
      'No', '', '', '',
      'Rajesh Sharma', '+919876543211', 'Engineer',
      'Sunita Sharma', '+919876543212', 'Teacher'
    ].map(v => `"${v}"`);

    const csv = [headers.join(','), sampleRow.join(',')].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=student_import_template.csv');
    res.send(csv);
  } catch (error) {
    console.error('Error generating template:', error);
    res.status(500).json({ success: false, message: 'Failed to generate template.' });
  }
};

// Import students from CSV
export const importStudents = async (req, res) => {
  try {
    const { groupId, schoolId, userId } = req.user;
    const { classSectionId, academicSessionId, csvData } = req.body;

    if (!csvData || !academicSessionId) {
      return res.status(400).json({ success: false, message: 'CSV data and academic session are required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Parse CSV
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        return res.status(400).json({ success: false, message: 'CSV file is empty or has no data rows.' });
      }

      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
      
      const results = {
        success: 0,
        failed: 0,
        errors: []
      };

      await dbClient.query('BEGIN');

      for (let i = 1; i < lines.length; i++) {
        try {
          // Parse CSV line (handle quoted values)
          const values = [];
          let current = '';
          let inQuotes = false;
          
          for (const char of lines[i]) {
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          values.push(current.trim());

          // Map to object
          const row = {};
          headers.forEach((h, idx) => {
            row[h] = values[idx] || '';
          });

          // Validate required fields
          const firstName = row['first name*'] || row['first name'] || '';
          const lastName = row['last name*'] || row['last name'] || '';
          const admissionNumber = row['admission number*'] || row['admission number'] || '';

          if (!firstName || !lastName) {
            results.failed++;
            results.errors.push(`Row ${i + 1}: First name and last name are required`);
            continue;
          }

          // Check for duplicate admission number
          if (admissionNumber) {
            const dupCheck = await dbClient.query(
              'SELECT id FROM students WHERE admission_number = $1 AND school_id = $2',
              [admissionNumber, schoolId]
            );
            if (dupCheck.rows.length > 0) {
              results.failed++;
              results.errors.push(`Row ${i + 1}: Admission number ${admissionNumber} already exists`);
              continue;
            }
          }

          // Insert student
          const studentResult = await dbClient.query(`
            INSERT INTO students (
              school_id, academic_session_id, current_class_section_id,
              admission_number, roll_number, admission_date,
              first_name, middle_name, last_name,
              date_of_birth, gender, blood_group,
              nationality, religion, caste, category,
              email, phone, alternate_phone,
              address_line1, address_line2, city, state, pincode, country,
              aadhar_number, medical_conditions, allergies,
              uses_transport, pickup_point,
              previous_school_name, previous_class,
              status, created_by
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
              $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, 'active', $33
            ) RETURNING id
          `, [
            schoolId,
            academicSessionId,
            classSectionId || null,
            admissionNumber || null,
            row['roll number'] || null,
            row['date of birth (yyyy-mm-dd)'] || row['admission date'] || new Date(),
            firstName,
            row['middle name'] || null,
            lastName,
            row['date of birth (yyyy-mm-dd)'] || row['date of birth'] || null,
            (row['gender (male/female/other)'] || row['gender'] || '').toLowerCase() || null,
            row['blood group'] || null,
            row['nationality'] || 'Indian',
            row['religion'] || null,
            row['caste'] || null,
            row['category (general/obc/sc/st/ews)'] || row['category'] || null,
            row['email'] || null,
            row['phone'] || null,
            row['alternate phone'] || null,
            row['address line 1'] || null,
            row['address line 2'] || null,
            row['city'] || null,
            row['state'] || null,
            row['pincode'] || null,
            row['country'] || 'India',
            row['aadhar number'] || null,
            row['medical conditions'] || null,
            row['allergies'] || null,
            (row['uses transport (yes/no)'] || row['uses transport'] || '').toLowerCase() === 'yes',
            row['pickup point'] || null,
            row['previous school'] || null,
            row['previous class'] || null,
            userId
          ]);

          const studentId = studentResult.rows[0].id;

          // Add father if provided
          const fatherName = row['father name'] || '';
          if (fatherName) {
            const nameParts = fatherName.split(' ');
            const fatherResult = await dbClient.query(`
              INSERT INTO parents (school_id, parent_type, first_name, last_name, phone, occupation, is_active)
              VALUES ($1, 'father', $2, $3, $4, $5, true)
              RETURNING id
            `, [
              schoolId,
              nameParts[0],
              nameParts.slice(1).join(' ') || null,
              row['father phone'] || null,
              row['father occupation'] || null
            ]);

            await dbClient.query(
              'INSERT INTO student_parents (student_id, parent_id, relationship, is_primary) VALUES ($1, $2, $3, $4)',
              [studentId, fatherResult.rows[0].id, 'father', true]
            );
          }

          // Add mother if provided
          const motherName = row['mother name'] || '';
          if (motherName) {
            const nameParts = motherName.split(' ');
            const motherResult = await dbClient.query(`
              INSERT INTO parents (school_id, parent_type, first_name, last_name, phone, occupation, is_active)
              VALUES ($1, 'mother', $2, $3, $4, $5, true)
              RETURNING id
            `, [
              schoolId,
              nameParts[0],
              nameParts.slice(1).join(' ') || null,
              row['mother phone'] || null,
              row['mother occupation'] || null
            ]);

            await dbClient.query(
              'INSERT INTO student_parents (student_id, parent_id, relationship, is_primary) VALUES ($1, $2, $3, $4)',
              [studentId, motherResult.rows[0].id, 'mother', false]
            );
          }

          results.success++;
        } catch (rowError) {
          results.failed++;
          results.errors.push(`Row ${i + 1}: ${rowError.message}`);
        }
      }

      await dbClient.query('COMMIT');

      res.json({
        success: true,
        message: `Import completed. ${results.success} students imported, ${results.failed} failed.`,
        data: results
      });
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error importing students:', error);
    res.status(500).json({ success: false, message: 'Failed to import students.' });
  }
};

// Get student academic mapping (class, subjects, teachers, fees)
export const getStudentAcademicMapping = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get student with class info
      const studentQuery = `
        SELECT 
          s.id, s.first_name, s.last_name, s.admission_number, s.roll_number,
          s.current_class_section_id, s.academic_session_id,
          cs.id as class_section_id, cs.class_grade_id,
          cg.name as grade_name, cg.display_name as grade_display_name, cg.numeric_value,
          sec.name as section_name,
          acs.name as session_name, acs.start_date as session_start, acs.end_date as session_end
        FROM students s
        LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        LEFT JOIN academic_sessions acs ON s.academic_session_id = acs.id
        WHERE s.id = $1 AND s.school_id = $2
      `;
      const studentResult = await dbClient.query(studentQuery, [id, schoolId]);

      if (studentResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      const student = studentResult.rows[0];

      // Get subjects assigned to the class section (via teacher_subjects) - grouped with all teachers
      let subjects = [];
      if (student.class_section_id) {
        const subjectsQuery = `
          SELECT 
            s.id, s.name, s.code, s.subject_type, s.is_mandatory, s.credit_hours, s.order_index,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', t.id,
                  'name', TRIM(CONCAT(t.first_name, ' ', t.last_name)),
                  'employeeId', t.employee_id
                )
              ) FILTER (WHERE t.id IS NOT NULL),
              '[]'
            ) as teachers
          FROM subjects s
          LEFT JOIN teacher_subjects ts ON s.id = ts.subject_id 
            AND ts.class_section_id = $1
          LEFT JOIN teachers t ON ts.teacher_id = t.id AND t.status = 'active'
          WHERE s.school_id = $2 AND s.is_active = true
            AND EXISTS (
              SELECT 1 FROM teacher_subjects ts2 
              WHERE ts2.subject_id = s.id AND ts2.class_section_id = $1
            )
          GROUP BY s.id, s.name, s.code, s.subject_type, s.is_mandatory, s.credit_hours, s.order_index
          ORDER BY s.subject_type DESC, s.order_index, s.name
        `;
        const subjectsResult = await dbClient.query(subjectsQuery, [
          student.class_section_id,
          schoolId
        ]);
        subjects = subjectsResult.rows.map(s => ({
          id: s.id,
          name: s.name,
          code: s.code,
          type: s.subject_type,
          isOptional: !s.is_mandatory,
          credits: s.credit_hours,
          teachers: s.teachers || []
        }));
      }

      // If no subjects found via teacher_subjects, get all school subjects
      if (subjects.length === 0) {
        const allSubjectsQuery = `
          SELECT s.id, s.name, s.code, s.subject_type, s.is_mandatory, s.credit_hours, s.order_index
          FROM subjects s
          WHERE s.school_id = $1 AND s.is_active = true
          ORDER BY s.subject_type DESC, s.order_index, s.name
        `;
        const allSubjectsResult = await dbClient.query(allSubjectsQuery, [schoolId]);
        subjects = allSubjectsResult.rows.map(s => ({
          id: s.id,
          name: s.name,
          code: s.code,
          type: s.subject_type,
          isOptional: !s.is_mandatory,
          credits: s.credit_hours,
          teachers: [] // Empty array for no teachers assigned
        }));
      }

      // Get all teachers assigned to this class section
      let teachers = [];
      if (student.class_section_id) {
        const teachersQuery = `
          SELECT DISTINCT
            t.id, t.first_name, t.last_name, t.employee_id, t.department, t.designation, t.email, t.phone,
            cs.class_teacher_id = t.id as is_class_teacher,
            ARRAY_AGG(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) as subjects_taught
          FROM teachers t
          LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id AND ts.class_section_id = $1
          LEFT JOIN subjects s ON ts.subject_id = s.id
          LEFT JOIN class_sections cs ON cs.id = $1
          WHERE t.school_id = $2 AND t.status = 'active'
            AND (
              ts.id IS NOT NULL 
              OR cs.class_teacher_id = t.id
            )
          GROUP BY t.id, t.first_name, t.last_name, t.employee_id, t.department, t.designation, t.email, t.phone, cs.class_teacher_id
          ORDER BY is_class_teacher DESC, t.first_name
        `;
        const teachersResult = await dbClient.query(teachersQuery, [student.class_section_id, schoolId]);
        teachers = teachersResult.rows.map(t => ({
          id: t.id,
          name: `${t.first_name} ${t.last_name}`.trim(),
          employeeId: t.employee_id,
          department: t.department,
          designation: t.designation,
          email: t.email,
          phone: t.phone,
          isClassTeacher: t.is_class_teacher,
          subjectsTaught: t.subjects_taught || []
        }));
      }

      // If no teachers found for class, get all active teachers
      if (teachers.length === 0) {
        const allTeachersQuery = `
          SELECT t.id, t.first_name, t.last_name, t.employee_id, t.department, t.designation, t.email, t.phone
          FROM teachers t
          WHERE t.school_id = $1 AND t.status = 'active'
          ORDER BY t.first_name
          LIMIT 10
        `;
        const allTeachersResult = await dbClient.query(allTeachersQuery, [schoolId]);
        teachers = allTeachersResult.rows.map(t => ({
          id: t.id,
          name: `${t.first_name} ${t.last_name}`.trim(),
          employeeId: t.employee_id,
          department: t.department,
          designation: t.designation,
          email: t.email,
          phone: t.phone,
          isClassTeacher: false,
          subjectsTaught: []
        }));
      }

      // Get applicable fee structure for this class
      let fees = [];
      if (student.class_grade_id) {
        const feesQuery = `
          SELECT 
            fs.id, fs.academic_session_id, fs.amount, fs.due_day, fs.notes,
            ft.id as fee_type_id, ft.name as fee_type_name, ft.category as fee_category, 
            ft.frequency, ft.is_mandatory
          FROM fee_structures fs
          JOIN fee_types ft ON fs.fee_type_id = ft.id
          WHERE fs.school_id = $1 
            AND fs.class_grade_id = $2
            AND fs.academic_session_id = $3
            AND fs.is_active = true
          ORDER BY ft.category, ft.name
        `;
        const feesResult = await dbClient.query(feesQuery, [
          schoolId,
          student.class_grade_id,
          student.academic_session_id
        ]);
        fees = feesResult.rows.map(f => ({
          id: f.id,
          name: f.fee_type_name,
          feeType: f.fee_type_name,
          category: f.fee_category,
          frequency: f.frequency,
          amount: parseFloat(f.amount) || 0,
          dueDay: f.due_day,
          notes: f.notes
        }));
      }

      // If no fees found for class grade, get sample fee types
      if (fees.length === 0) {
        const feeTypesQuery = `
          SELECT id, name, category, frequency
          FROM fee_types
          WHERE school_id = $1 AND is_active = true
          ORDER BY category, name
        `;
        const feeTypesResult = await dbClient.query(feeTypesQuery, [schoolId]);
        fees = feeTypesResult.rows.map(f => ({
          id: f.id,
          name: f.name,
          feeType: f.name,
          category: f.category,
          frequency: f.frequency,
          amount: 0,
          dueDay: null,
          notes: 'Fee type available - configure amount in Fee Structure'
        }));
      }

      // Calculate total fees
      const totalFees = fees.reduce((sum, f) => sum + f.amount, 0);

      res.json({
        success: true,
        data: {
          student: {
            id: student.id,
            name: `${student.first_name} ${student.last_name}`.trim(),
            admissionNumber: student.admission_number,
            rollNumber: student.roll_number
          },
          classSection: student.class_section_id ? {
            id: student.class_section_id,
            className: `${student.grade_display_name} - ${student.section_name}`,
            gradeName: student.grade_display_name,
            sectionName: student.section_name,
            numericValue: student.numeric_value
          } : null,
          academicSession: {
            id: student.academic_session_id,
            name: student.session_name,
            startDate: student.session_start,
            endDate: student.session_end
          },
          subjects,
          teachers,
          fees: {
            items: fees,
            totalAmount: totalFees,
            currency: '₹'
          },
          summary: {
            totalSubjects: subjects.length,
            mandatorySubjects: subjects.filter(s => !s.isOptional).length,
            optionalSubjects: subjects.filter(s => s.isOptional).length,
            totalTeachers: teachers.length,
            classTeacher: teachers.find(t => t.isClassTeacher) || null,
            totalFees
          }
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting academic mapping:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch academic mapping.' });
  }
};

// Update student's class section (academic mapping)
export const updateStudentClassSection = async (req, res) => {
  try {
    const { groupId, schoolId, userId } = req.user;
    const { id } = req.params;
    const { classSectionId, academicSessionId, reason } = req.body;

    if (!classSectionId) {
      return res.status(400).json({ success: false, message: 'Class section is required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Verify class section exists
      const csCheck = await dbClient.query(
        'SELECT id FROM class_sections WHERE id = $1 AND school_id = $2',
        [classSectionId, schoolId]
      );

      if (csCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Class section not found.' });
      }

      // Get current class section for history
      const currentStudent = await dbClient.query(
        'SELECT current_class_section_id, academic_session_id FROM students WHERE id = $1 AND school_id = $2',
        [id, schoolId]
      );

      if (currentStudent.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found.' });
      }

      const oldClassSectionId = currentStudent.rows[0].current_class_section_id;

      await dbClient.query('BEGIN');

      // If there's an old class section, update history
      if (oldClassSectionId && oldClassSectionId !== classSectionId) {
        // End previous class history entry
        await dbClient.query(`
          UPDATE student_class_history 
          SET end_date = CURRENT_DATE, status = 'transferred', notes = $1
          WHERE student_id = $2 AND class_section_id = $3 AND end_date IS NULL
        `, [reason || 'Class changed', id, oldClassSectionId]);
      }

      // Add new class history entry
      await dbClient.query(`
        INSERT INTO student_class_history (
          student_id, academic_session_id, class_section_id, 
          start_date, status, notes, created_by
        ) VALUES ($1, $2, $3, CURRENT_DATE, 'active', $4, $5)
        ON CONFLICT DO NOTHING
      `, [
        id,
        academicSessionId || currentStudent.rows[0].academic_session_id,
        classSectionId,
        reason || 'Class assigned',
        userId
      ]);

      // Update student's current class
      await dbClient.query(`
        UPDATE students 
        SET current_class_section_id = $1, 
            academic_session_id = COALESCE($2, academic_session_id),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $3 AND school_id = $4
      `, [classSectionId, academicSessionId, id, schoolId]);

      await dbClient.query('COMMIT');

      res.json({
        success: true,
        message: 'Student class section updated successfully.'
      });
    } catch (error) {
      await dbClient.query('ROLLBACK');
      throw error;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error updating class section:', error);
    res.status(500).json({ success: false, message: 'Failed to update class section.' });
  }
};

