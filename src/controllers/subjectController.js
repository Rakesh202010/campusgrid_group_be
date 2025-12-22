import { getGroupDbClient } from '../lib/groupDb.js';

// =====================================================
// SUBJECTS CRUD
// =====================================================

/**
 * Get all subjects for the school
 */
export const getSubjects = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { category, is_active, subject_type } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT 
          id, name, code, display_name, description, category, subject_type,
          is_mandatory, credit_hours, max_marks, passing_marks, order_index,
          color, icon, is_active, school_id, created_at, updated_at
        FROM subjects
        WHERE school_id = $1
      `;
      const params = [schoolId];
      let paramIndex = 2;

      if (category) {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (subject_type) {
        query += ` AND subject_type = $${paramIndex}`;
        params.push(subject_type);
        paramIndex++;
      }

      if (is_active !== undefined) {
        query += ` AND is_active = $${paramIndex}`;
        params.push(is_active === 'true');
        paramIndex++;
      }

      query += ` ORDER BY order_index ASC, name ASC`;

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          code: row.code,
          displayName: row.display_name || row.name,
          description: row.description,
          category: row.category,
          subjectType: row.subject_type,
          isMandatory: row.is_mandatory,
          creditHours: row.credit_hours,
          maxMarks: row.max_marks,
          passingMarks: row.passing_marks,
          orderIndex: row.order_index,
          color: row.color,
          icon: row.icon,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get subjects error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subjects',
      error: error.message
    });
  }
};

/**
 * Create a new subject
 */
export const createSubject = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { 
      name, code, displayName, description, category, subjectType,
      isMandatory, creditHours, maxMarks, passingMarks, orderIndex,
      color, icon, isActive 
    } = req.body;

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Name and code are required'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for duplicate code
      const existingResult = await dbClient.query(
        `SELECT id FROM subjects WHERE school_id = $1 AND code = $2`,
        [schoolId, code]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'A subject with this code already exists'
        });
      }

      const result = await dbClient.query(
        `INSERT INTO subjects (
          name, code, display_name, description, category, subject_type,
          is_mandatory, credit_hours, max_marks, passing_marks, order_index,
          color, icon, is_active, school_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          name, code, displayName || name, description, category || 'core',
          subjectType || 'theory', isMandatory !== false, creditHours || 0,
          maxMarks || 100, passingMarks || 33, orderIndex || 0,
          color || '#3B82F6', icon, isActive !== false, schoolId
        ]
      );

      const row = result.rows[0];

      res.status(201).json({
        success: true,
        message: 'Subject created successfully',
        data: {
          id: row.id,
          name: row.name,
          code: row.code,
          displayName: row.display_name,
          description: row.description,
          category: row.category,
          subjectType: row.subject_type,
          isMandatory: row.is_mandatory,
          creditHours: row.credit_hours,
          maxMarks: row.max_marks,
          passingMarks: row.passing_marks,
          orderIndex: row.order_index,
          color: row.color,
          icon: row.icon,
          isActive: row.is_active,
          createdAt: row.created_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create subject error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subject',
      error: error.message
    });
  }
};

/**
 * Update a subject
 */
export const updateSubject = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { 
      name, code, displayName, description, category, subjectType,
      isMandatory, creditHours, maxMarks, passingMarks, orderIndex,
      color, icon, isActive 
    } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for duplicate code (excluding current subject)
      if (code) {
        const existingResult = await dbClient.query(
          `SELECT id FROM subjects WHERE school_id = $1 AND code = $2 AND id != $3`,
          [schoolId, code, id]
        );

        if (existingResult.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'A subject with this code already exists'
          });
        }
      }

      const result = await dbClient.query(
        `UPDATE subjects SET
          name = COALESCE($1, name),
          code = COALESCE($2, code),
          display_name = COALESCE($3, display_name),
          description = COALESCE($4, description),
          category = COALESCE($5, category),
          subject_type = COALESCE($6, subject_type),
          is_mandatory = COALESCE($7, is_mandatory),
          credit_hours = COALESCE($8, credit_hours),
          max_marks = COALESCE($9, max_marks),
          passing_marks = COALESCE($10, passing_marks),
          order_index = COALESCE($11, order_index),
          color = COALESCE($12, color),
          icon = COALESCE($13, icon),
          is_active = COALESCE($14, is_active),
          updated_at = NOW()
        WHERE id = $15 AND school_id = $16
        RETURNING *`,
        [
          name, code, displayName, description, category, subjectType,
          isMandatory, creditHours, maxMarks, passingMarks, orderIndex,
          color, icon, isActive, id, schoolId
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Subject not found'
        });
      }

      const row = result.rows[0];

      res.json({
        success: true,
        message: 'Subject updated successfully',
        data: {
          id: row.id,
          name: row.name,
          code: row.code,
          displayName: row.display_name,
          description: row.description,
          category: row.category,
          subjectType: row.subject_type,
          isMandatory: row.is_mandatory,
          creditHours: row.credit_hours,
          maxMarks: row.max_marks,
          passingMarks: row.passing_marks,
          orderIndex: row.order_index,
          color: row.color,
          icon: row.icon,
          isActive: row.is_active,
          updatedAt: row.updated_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update subject error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update subject',
      error: error.message
    });
  }
};

/**
 * Delete a subject
 */
export const deleteSubject = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM subjects WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Subject not found'
        });
      }

      res.json({
        success: true,
        message: 'Subject deleted successfully'
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete subject error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete subject',
      error: error.message
    });
  }
};

/**
 * Bulk create common subjects
 */
export const bulkCreateSubjects = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { subjects: subjectsList } = req.body;

    if (!subjectsList || !Array.isArray(subjectsList) || subjectsList.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Subjects list is required'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let created = 0;
      let skipped = 0;

      for (const subject of subjectsList) {
        // Check if already exists
        const existingResult = await dbClient.query(
          `SELECT id FROM subjects WHERE school_id = $1 AND code = $2`,
          [schoolId, subject.code]
        );

        if (existingResult.rows.length > 0) {
          skipped++;
          continue;
        }

        await dbClient.query(
          `INSERT INTO subjects (
            name, code, display_name, category, subject_type, color, order_index, school_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            subject.name, subject.code, subject.displayName || subject.name,
            subject.category || 'core', subject.subjectType || 'theory',
            subject.color || '#3B82F6', subject.orderIndex || created, schoolId
          ]
        );

        created++;
      }

      res.status(201).json({
        success: true,
        message: `Created ${created} subjects, skipped ${skipped} (already exist)`,
        data: { created, skipped }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Bulk create subjects error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subjects',
      error: error.message
    });
  }
};


// =====================================================
// CLASS SUBJECTS (CURRICULUM MAPPING)
// =====================================================

/**
 * Get curriculum (subjects assigned to class-sections)
 */
export const getClassSubjects = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { class_section_id, subject_id, academic_session_id, is_active } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT 
          cs.id, cs.class_section_id, cs.subject_id, cs.academic_session_id,
          cs.teacher_id, cs.periods_per_week, cs.is_optional, cs.syllabus_url,
          cs.notes, cs.is_active, cs.school_id, cs.created_at, cs.updated_at,
          s.name as subject_name, s.code as subject_code, s.display_name as subject_display_name,
          s.category as subject_category, s.color as subject_color,
          cg.name as grade_name, cg.display_name as grade_display_name,
          sec.name as section_name, sec.display_name as section_display_name,
          acs.name as session_name, acs.code as session_code
        FROM class_subjects cs
        INNER JOIN subjects s ON cs.subject_id = s.id
        INNER JOIN class_sections cls ON cs.class_section_id = cls.id
        INNER JOIN class_grades cg ON cls.class_grade_id = cg.id
        INNER JOIN sections sec ON cls.section_id = sec.id
        LEFT JOIN academic_sessions acs ON cs.academic_session_id = acs.id
        WHERE cs.school_id = $1
      `;
      const params = [schoolId];
      let paramIndex = 2;

      if (class_section_id) {
        query += ` AND cs.class_section_id = $${paramIndex}`;
        params.push(class_section_id);
        paramIndex++;
      }

      if (subject_id) {
        query += ` AND cs.subject_id = $${paramIndex}`;
        params.push(subject_id);
        paramIndex++;
      }

      if (academic_session_id) {
        query += ` AND cs.academic_session_id = $${paramIndex}`;
        params.push(academic_session_id);
        paramIndex++;
      }

      if (is_active !== undefined) {
        query += ` AND cs.is_active = $${paramIndex}`;
        params.push(is_active === 'true');
        paramIndex++;
      }

      query += ` ORDER BY cg.order_index ASC, sec.order_index ASC, s.order_index ASC`;

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          classSectionId: row.class_section_id,
          subjectId: row.subject_id,
          academicSessionId: row.academic_session_id,
          teacherId: row.teacher_id,
          periodsPerWeek: row.periods_per_week,
          isOptional: row.is_optional,
          syllabusUrl: row.syllabus_url,
          notes: row.notes,
          isActive: row.is_active,
          subjectName: row.subject_name,
          subjectCode: row.subject_code,
          subjectDisplayName: row.subject_display_name,
          subjectCategory: row.subject_category,
          subjectColor: row.subject_color,
          gradeName: row.grade_name,
          gradeDisplayName: row.grade_display_name,
          sectionName: row.section_name,
          sectionDisplayName: row.section_display_name,
          classDisplayName: `${row.grade_display_name} - ${row.section_display_name || row.section_name}`,
          sessionName: row.session_name,
          sessionCode: row.session_code,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get class subjects error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch curriculum',
      error: error.message
    });
  }
};

/**
 * Assign a subject to a class-section
 */
export const createClassSubject = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { 
      classSectionId, subjectId, academicSessionId, teacherId,
      periodsPerWeek, isOptional, syllabusUrl, notes, isActive 
    } = req.body;

    if (!classSectionId || !subjectId) {
      return res.status(400).json({
        success: false,
        message: 'Class section and subject are required'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for duplicate
      const existingResult = await dbClient.query(
        `SELECT id FROM class_subjects 
         WHERE class_section_id = $1 AND subject_id = $2 AND academic_session_id = $3`,
        [classSectionId, subjectId, academicSessionId || null]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'This subject is already assigned to this class'
        });
      }

      const result = await dbClient.query(
        `INSERT INTO class_subjects (
          class_section_id, subject_id, academic_session_id, teacher_id,
          periods_per_week, is_optional, syllabus_url, notes, is_active, school_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          classSectionId, subjectId, academicSessionId, teacherId,
          periodsPerWeek || 5, isOptional || false, syllabusUrl, notes,
          isActive !== false, schoolId
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Subject assigned to class successfully',
        data: result.rows[0]
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create class subject error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign subject',
      error: error.message
    });
  }
};

/**
 * Update a class subject assignment
 */
export const updateClassSubject = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { teacherId, periodsPerWeek, isOptional, syllabusUrl, notes, isActive } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `UPDATE class_subjects SET
          teacher_id = COALESCE($1, teacher_id),
          periods_per_week = COALESCE($2, periods_per_week),
          is_optional = COALESCE($3, is_optional),
          syllabus_url = COALESCE($4, syllabus_url),
          notes = COALESCE($5, notes),
          is_active = COALESCE($6, is_active),
          updated_at = NOW()
        WHERE id = $7 AND school_id = $8
        RETURNING *`,
        [teacherId, periodsPerWeek, isOptional, syllabusUrl, notes, isActive, id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Assignment not found'
        });
      }

      res.json({
        success: true,
        message: 'Assignment updated successfully',
        data: result.rows[0]
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update class subject error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update assignment',
      error: error.message
    });
  }
};

/**
 * Remove a subject from a class-section
 */
export const deleteClassSubject = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM class_subjects WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Assignment not found'
        });
      }

      res.json({
        success: true,
        message: 'Subject removed from class successfully'
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete class subject error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove subject',
      error: error.message
    });
  }
};

/**
 * Bulk assign subjects to a class-section
 */
export const bulkAssignSubjects = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { classSectionId, subjectIds, academicSessionId, periodsPerWeek } = req.body;

    if (!classSectionId || !subjectIds || !Array.isArray(subjectIds) || subjectIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Class section and subject IDs are required'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let created = 0;
      let skipped = 0;

      for (const subjectId of subjectIds) {
        // Check if already exists
        const existingResult = await dbClient.query(
          `SELECT id FROM class_subjects 
           WHERE class_section_id = $1 AND subject_id = $2 AND academic_session_id = $3`,
          [classSectionId, subjectId, academicSessionId || null]
        );

        if (existingResult.rows.length > 0) {
          skipped++;
          continue;
        }

        await dbClient.query(
          `INSERT INTO class_subjects (
            class_section_id, subject_id, academic_session_id, periods_per_week, school_id
          ) VALUES ($1, $2, $3, $4, $5)`,
          [classSectionId, subjectId, academicSessionId, periodsPerWeek || 5, schoolId]
        );

        created++;
      }

      res.status(201).json({
        success: true,
        message: `Assigned ${created} subjects, skipped ${skipped} (already assigned)`,
        data: { created, skipped }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Bulk assign subjects error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign subjects',
      error: error.message
    });
  }
};

/**
 * Copy curriculum from one class-section to another
 */
export const copyCurriculum = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { sourceClassSectionId, targetClassSectionId, academicSessionId } = req.body;

    if (!sourceClassSectionId || !targetClassSectionId) {
      return res.status(400).json({
        success: false,
        message: 'Source and target class sections are required'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get subjects from source
      const sourceResult = await dbClient.query(
        `SELECT subject_id, periods_per_week, is_optional
         FROM class_subjects
         WHERE class_section_id = $1 AND school_id = $2`,
        [sourceClassSectionId, schoolId]
      );

      if (sourceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No subjects found in source class'
        });
      }

      let created = 0;
      let skipped = 0;

      for (const row of sourceResult.rows) {
        // Check if already exists
        const existingResult = await dbClient.query(
          `SELECT id FROM class_subjects 
           WHERE class_section_id = $1 AND subject_id = $2 AND academic_session_id = $3`,
          [targetClassSectionId, row.subject_id, academicSessionId || null]
        );

        if (existingResult.rows.length > 0) {
          skipped++;
          continue;
        }

        await dbClient.query(
          `INSERT INTO class_subjects (
            class_section_id, subject_id, academic_session_id, periods_per_week, is_optional, school_id
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [targetClassSectionId, row.subject_id, academicSessionId, row.periods_per_week, row.is_optional, schoolId]
        );

        created++;
      }

      res.status(201).json({
        success: true,
        message: `Copied ${created} subjects, skipped ${skipped} (already exist)`,
        data: { created, skipped, total: sourceResult.rows.length }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Copy curriculum error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to copy curriculum',
      error: error.message
    });
  }
};

