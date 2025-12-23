import { getGroupDbClient } from '../lib/groupDb.js';

// =====================================================
// SUBJECT ASSIGNMENT - COMPREHENSIVE EDGE CASES
// =====================================================

// Get all subject assignments for the school (with filters)
export const getAllSubjectAssignments = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, subject_id, class_section_id, teacher_id, is_primary } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT 
          ts.id,
          ts.teacher_id,
          ts.subject_id,
          ts.class_section_id,
          ts.academic_session_id,
          ts.is_primary,
          ts.periods_per_week,
          ts.created_at,
          t.first_name || ' ' || COALESCE(t.last_name, '') as teacher_name,
          t.employee_id,
          t.department as teacher_department,
          s.name as subject_name,
          s.code as subject_code,
          s.category as subject_category,
          cg.name as class_name,
          cg.display_name as class_display_name,
          cg.numeric_value as class_order,
          sec.name as section_name,
          sec.display_name as section_display_name,
          a.name as session_name
        FROM teacher_subjects ts
        JOIN teachers t ON ts.teacher_id = t.id
        JOIN subjects s ON ts.subject_id = s.id
        LEFT JOIN class_sections cs ON ts.class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        LEFT JOIN academic_sessions a ON ts.academic_session_id = a.id
        WHERE t.school_id = $1
      `;
      const params = [schoolId];
      let paramIndex = 2;

      if (academic_session_id) {
        query += ` AND ts.academic_session_id = $${paramIndex}`;
        params.push(academic_session_id);
        paramIndex++;
      }

      if (subject_id) {
        query += ` AND ts.subject_id = $${paramIndex}`;
        params.push(subject_id);
        paramIndex++;
      }

      if (class_section_id) {
        query += ` AND ts.class_section_id = $${paramIndex}`;
        params.push(class_section_id);
        paramIndex++;
      }

      if (teacher_id) {
        query += ` AND ts.teacher_id = $${paramIndex}`;
        params.push(teacher_id);
        paramIndex++;
      }

      if (is_primary !== undefined) {
        query += ` AND ts.is_primary = $${paramIndex}`;
        params.push(is_primary === 'true');
        paramIndex++;
      }

      query += ` ORDER BY cg.numeric_value, sec.name, s.name, t.first_name`;

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(r => ({
          id: r.id,
          teacherId: r.teacher_id,
          teacherName: r.teacher_name?.trim(),
          employeeId: r.employee_id,
          teacherDepartment: r.teacher_department,
          subjectId: r.subject_id,
          subjectName: r.subject_name,
          subjectCode: r.subject_code,
          subjectCategory: r.subject_category,
          classSectionId: r.class_section_id,
          className: r.class_display_name || r.class_name,
          sectionName: r.section_display_name || r.section_name,
          classSection: r.class_name && r.section_name ? `${r.class_display_name || r.class_name} - ${r.section_display_name || r.section_name}` : 'All Classes',
          classOrder: r.class_order,
          academicSessionId: r.academic_session_id,
          sessionName: r.session_name,
          isPrimary: r.is_primary,
          periodsPerWeek: r.periods_per_week,
          createdAt: r.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get all subject assignments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assignments', error: error.message });
  }
};

// Get assignments grouped by teacher (workload view)
export const getAssignmentsByTeacher = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;

    if (!academic_session_id) {
      return res.status(400).json({ success: false, message: 'Academic session ID is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const teachers = await dbClient.query(
        `SELECT id, first_name, last_name, employee_id, department, designation 
         FROM teachers WHERE school_id = $1 AND is_active = true 
         ORDER BY first_name`,
        [schoolId]
      );

      const assignments = await dbClient.query(
        `SELECT ts.*, s.name as subject_name, s.code as subject_code,
                cg.name as class_name, cg.display_name as class_display_name,
                sec.name as section_name
         FROM teacher_subjects ts
         JOIN subjects s ON ts.subject_id = s.id
         LEFT JOIN class_sections cs ON ts.class_section_id = cs.id
         LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
         LEFT JOIN sections sec ON cs.section_id = sec.id
         WHERE ts.academic_session_id = $1`,
        [academic_session_id]
      );

      const result = teachers.rows.map(t => {
        const teacherAssignments = assignments.rows.filter(a => a.teacher_id === t.id);
        const totalPeriods = teacherAssignments.reduce((sum, a) => sum + (a.periods_per_week || 0), 0);
        const primaryCount = teacherAssignments.filter(a => a.is_primary).length;
        
        return {
          teacherId: t.id,
          teacherName: `${t.first_name} ${t.last_name || ''}`.trim(),
          employeeId: t.employee_id,
          department: t.department,
          designation: t.designation,
          totalSubjects: teacherAssignments.length,
          totalPeriods,
          primaryAssignments: primaryCount,
          workloadStatus: totalPeriods > 30 ? 'overloaded' : totalPeriods > 20 ? 'heavy' : totalPeriods > 10 ? 'moderate' : 'light',
          assignments: teacherAssignments.map(a => ({
            id: a.id,
            subjectId: a.subject_id,
            subjectName: a.subject_name,
            subjectCode: a.subject_code,
            classSectionId: a.class_section_id,
            classSection: a.class_name && a.section_name ? `${a.class_display_name || a.class_name} - ${a.section_name}` : 'All',
            isPrimary: a.is_primary,
            periodsPerWeek: a.periods_per_week
          }))
        };
      });

      res.json({ success: true, data: result });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get assignments by teacher error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch', error: error.message });
  }
};

// Get assignments grouped by subject
export const getAssignmentsBySubject = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;

    if (!academic_session_id) {
      return res.status(400).json({ success: false, message: 'Academic session ID is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const subjects = await dbClient.query(
        `SELECT id, name, code, category, description FROM subjects WHERE school_id = $1 AND is_active = true ORDER BY name`,
        [schoolId]
      );

      const assignments = await dbClient.query(
        `SELECT ts.*, t.first_name, t.last_name, t.employee_id, t.department,
                cg.name as class_name, cg.display_name as class_display_name,
                sec.name as section_name
         FROM teacher_subjects ts
         JOIN teachers t ON ts.teacher_id = t.id
         LEFT JOIN class_sections cs ON ts.class_section_id = cs.id
         LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
         LEFT JOIN sections sec ON cs.section_id = sec.id
         WHERE ts.academic_session_id = $1`,
        [academic_session_id]
      );

      const result = subjects.rows.map(s => {
        const subjectAssignments = assignments.rows.filter(a => a.subject_id === s.id);
        const primaryTeacher = subjectAssignments.find(a => a.is_primary && !a.class_section_id);
        
        return {
          subjectId: s.id,
          subjectName: s.name,
          subjectCode: s.code,
          category: s.category,
          description: s.description,
          totalTeachers: [...new Set(subjectAssignments.map(a => a.teacher_id))].length,
          totalAssignments: subjectAssignments.length,
          hasPrimaryTeacher: !!primaryTeacher,
          primaryTeacherName: primaryTeacher ? `${primaryTeacher.first_name} ${primaryTeacher.last_name || ''}`.trim() : null,
          assignments: subjectAssignments.map(a => ({
            id: a.id,
            teacherId: a.teacher_id,
            teacherName: `${a.first_name} ${a.last_name || ''}`.trim(),
            employeeId: a.employee_id,
            department: a.department,
            classSectionId: a.class_section_id,
            classSection: a.class_name && a.section_name ? `${a.class_display_name || a.class_name} - ${a.section_name}` : 'All Classes',
            isPrimary: a.is_primary,
            periodsPerWeek: a.periods_per_week
          }))
        };
      });

      res.json({ success: true, data: result });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get assignments by subject error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch', error: error.message });
  }
};

// Get assignments grouped by class
export const getAssignmentsByClass = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;

    if (!academic_session_id) {
      return res.status(400).json({ success: false, message: 'Academic session ID is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const classSections = await dbClient.query(
        `SELECT cs.id, cg.name as class_name, cg.display_name as class_display_name, 
                cg.numeric_value, sec.name as section_name, sec.display_name as section_display_name
         FROM class_sections cs
         JOIN class_grades cg ON cs.class_grade_id = cg.id
         JOIN sections sec ON cs.section_id = sec.id
         WHERE cs.school_id = $1 AND cs.academic_session_id = $2 AND cs.is_active = true
         ORDER BY cg.numeric_value, sec.name`,
        [schoolId, academic_session_id]
      );

      const assignments = await dbClient.query(
        `SELECT ts.*, t.first_name, t.last_name, t.employee_id,
                s.name as subject_name, s.code as subject_code
         FROM teacher_subjects ts
         JOIN teachers t ON ts.teacher_id = t.id
         JOIN subjects s ON ts.subject_id = s.id
         WHERE ts.academic_session_id = $1`,
        [academic_session_id]
      );

      const result = classSections.rows.map(cs => {
        const classAssignments = assignments.rows.filter(a => a.class_section_id === cs.id);
        
        return {
          classSectionId: cs.id,
          className: cs.class_display_name || cs.class_name,
          sectionName: cs.section_display_name || cs.section_name,
          displayName: `${cs.class_display_name || cs.class_name} - ${cs.section_display_name || cs.section_name}`,
          classOrder: cs.numeric_value,
          totalSubjects: [...new Set(classAssignments.map(a => a.subject_id))].length,
          totalTeachers: [...new Set(classAssignments.map(a => a.teacher_id))].length,
          totalPeriods: classAssignments.reduce((sum, a) => sum + (a.periods_per_week || 0), 0),
          assignments: classAssignments.map(a => ({
            id: a.id,
            teacherId: a.teacher_id,
            teacherName: `${a.first_name} ${a.last_name || ''}`.trim(),
            employeeId: a.employee_id,
            subjectId: a.subject_id,
            subjectName: a.subject_name,
            subjectCode: a.subject_code,
            isPrimary: a.is_primary,
            periodsPerWeek: a.periods_per_week
          }))
        };
      });

      res.json({ success: true, data: result });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get assignments by class error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch', error: error.message });
  }
};

// Check for conflicts before assigning
export const checkAssignmentConflicts = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { teacherId, subjectId, classSectionId, academicSessionId, isPrimary } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const conflicts = [];
      const warnings = [];

      // Check 1: Duplicate assignment
      const duplicate = await dbClient.query(
        `SELECT id FROM teacher_subjects 
         WHERE teacher_id = $1 AND subject_id = $2 AND class_section_id IS NOT DISTINCT FROM $3 AND academic_session_id = $4`,
        [teacherId, subjectId, classSectionId, academicSessionId]
      );
      if (duplicate.rows.length > 0) {
        conflicts.push({ type: 'DUPLICATE', message: 'This exact assignment already exists' });
      }

      // Check 2: Primary teacher conflict (if setting as primary)
      if (isPrimary && classSectionId) {
        const existingPrimary = await dbClient.query(
          `SELECT ts.id, t.first_name, t.last_name
           FROM teacher_subjects ts
           JOIN teachers t ON ts.teacher_id = t.id
           WHERE ts.subject_id = $1 AND ts.class_section_id = $2 AND ts.academic_session_id = $3 AND ts.is_primary = true`,
          [subjectId, classSectionId, academicSessionId]
        );
        if (existingPrimary.rows.length > 0) {
          warnings.push({
            type: 'PRIMARY_EXISTS',
            message: `${existingPrimary.rows[0].first_name} ${existingPrimary.rows[0].last_name || ''} is already the primary teacher. They will be changed to secondary.`,
            existingAssignmentId: existingPrimary.rows[0].id
          });
        }
      }

      // Check 3: Teacher workload
      const workload = await dbClient.query(
        `SELECT SUM(periods_per_week) as total_periods, COUNT(*) as total_subjects
         FROM teacher_subjects WHERE teacher_id = $1 AND academic_session_id = $2`,
        [teacherId, academicSessionId]
      );
      const currentPeriods = parseInt(workload.rows[0]?.total_periods || 0);
      if (currentPeriods > 25) {
        warnings.push({
          type: 'HEAVY_WORKLOAD',
          message: `Teacher already has ${currentPeriods} periods/week. Adding more may overload them.`,
          currentPeriods
        });
      }

      // Check 4: Subject specialty mismatch
      const teacher = await dbClient.query(
        `SELECT department, specialization FROM teachers WHERE id = $1`,
        [teacherId]
      );
      const subject = await dbClient.query(
        `SELECT name, category FROM subjects WHERE id = $1`,
        [subjectId]
      );
      if (teacher.rows[0] && subject.rows[0]) {
        const dept = teacher.rows[0].department?.toLowerCase() || '';
        const subjectCat = subject.rows[0].category?.toLowerCase() || '';
        if (dept && subjectCat && !dept.includes(subjectCat) && !subjectCat.includes(dept)) {
          warnings.push({
            type: 'DEPARTMENT_MISMATCH',
            message: `Teacher's department (${teacher.rows[0].department}) may not match subject category (${subject.rows[0].category})`,
            teacherDepartment: teacher.rows[0].department,
            subjectCategory: subject.rows[0].category
          });
        }
      }

      res.json({
        success: true,
        data: {
          hasConflicts: conflicts.length > 0,
          hasWarnings: warnings.length > 0,
          conflicts,
          warnings,
          canProceed: conflicts.length === 0
        }
      });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Check assignment conflicts error:', error);
    res.status(500).json({ success: false, message: 'Failed to check conflicts', error: error.message });
  }
};

// Assign subject with conflict resolution
export const assignSubjectWithConflictResolution = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { teacherId, subjectId, classSectionId, academicSessionId, isPrimary, periodsPerWeek, forceAssign } = req.body;

    if (!teacherId || !subjectId || !academicSessionId) {
      return res.status(400).json({ success: false, message: 'Teacher, Subject and Academic Session are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for duplicate
      const duplicate = await dbClient.query(
        `SELECT id FROM teacher_subjects 
         WHERE teacher_id = $1 AND subject_id = $2 AND class_section_id IS NOT DISTINCT FROM $3 AND academic_session_id = $4`,
        [teacherId, subjectId, classSectionId, academicSessionId]
      );
      if (duplicate.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'This assignment already exists' });
      }

      // If setting as primary, demote existing primary
      if (isPrimary && classSectionId) {
        await dbClient.query(
          `UPDATE teacher_subjects SET is_primary = false 
           WHERE subject_id = $1 AND class_section_id = $2 AND academic_session_id = $3 AND is_primary = true`,
          [subjectId, classSectionId, academicSessionId]
        );
      }

      // Create the assignment
      const result = await dbClient.query(
        `INSERT INTO teacher_subjects (teacher_id, subject_id, class_section_id, academic_session_id, is_primary, periods_per_week)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [teacherId, subjectId, classSectionId, academicSessionId, isPrimary || false, periodsPerWeek || 0]
      );

      res.status(201).json({ success: true, message: 'Subject assigned successfully', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Assign subject error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign subject', error: error.message });
  }
};

// Bulk assign subjects to a teacher
export const bulkAssignToTeacher = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { teacherId, assignments, academicSessionId } = req.body;

    if (!teacherId || !assignments || !Array.isArray(assignments) || !academicSessionId) {
      return res.status(400).json({ success: false, message: 'Teacher, assignments array and academic session are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let created = 0;
      let skipped = 0;
      let updated = 0;
      const errors = [];

      for (const assignment of assignments) {
        try {
          // Check existing
          const existing = await dbClient.query(
            `SELECT id FROM teacher_subjects 
             WHERE teacher_id = $1 AND subject_id = $2 AND class_section_id IS NOT DISTINCT FROM $3 AND academic_session_id = $4`,
            [teacherId, assignment.subjectId, assignment.classSectionId, academicSessionId]
          );

          if (existing.rows.length > 0) {
            // Update if exists
            await dbClient.query(
              `UPDATE teacher_subjects SET is_primary = $1, periods_per_week = $2 WHERE id = $3`,
              [assignment.isPrimary || false, assignment.periodsPerWeek || 0, existing.rows[0].id]
            );
            updated++;
          } else {
            // Handle primary conflict
            if (assignment.isPrimary && assignment.classSectionId) {
              await dbClient.query(
                `UPDATE teacher_subjects SET is_primary = false 
                 WHERE subject_id = $1 AND class_section_id = $2 AND academic_session_id = $3 AND is_primary = true`,
                [assignment.subjectId, assignment.classSectionId, academicSessionId]
              );
            }

            await dbClient.query(
              `INSERT INTO teacher_subjects (teacher_id, subject_id, class_section_id, academic_session_id, is_primary, periods_per_week)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [teacherId, assignment.subjectId, assignment.classSectionId, academicSessionId, assignment.isPrimary || false, assignment.periodsPerWeek || 0]
            );
            created++;
          }
        } catch (e) {
          errors.push({ assignment, error: e.message });
          skipped++;
        }
      }

      res.json({
        success: true,
        message: `Created ${created}, updated ${updated}, skipped ${skipped}`,
        data: { created, updated, skipped, errors }
      });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Bulk assign to teacher error:', error);
    res.status(500).json({ success: false, message: 'Failed to bulk assign', error: error.message });
  }
};

// Bulk assign a subject to multiple classes
export const bulkAssignSubjectToClasses = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { teacherId, subjectId, classSectionIds, academicSessionId, isPrimary, periodsPerWeek } = req.body;

    if (!teacherId || !subjectId || !classSectionIds || !Array.isArray(classSectionIds) || !academicSessionId) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let created = 0;
      let skipped = 0;

      for (const classSectionId of classSectionIds) {
        const existing = await dbClient.query(
          `SELECT id FROM teacher_subjects 
           WHERE teacher_id = $1 AND subject_id = $2 AND class_section_id = $3 AND academic_session_id = $4`,
          [teacherId, subjectId, classSectionId, academicSessionId]
        );

        if (existing.rows.length === 0) {
          if (isPrimary) {
            await dbClient.query(
              `UPDATE teacher_subjects SET is_primary = false 
               WHERE subject_id = $1 AND class_section_id = $2 AND academic_session_id = $3 AND is_primary = true`,
              [subjectId, classSectionId, academicSessionId]
            );
          }

          await dbClient.query(
            `INSERT INTO teacher_subjects (teacher_id, subject_id, class_section_id, academic_session_id, is_primary, periods_per_week)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [teacherId, subjectId, classSectionId, academicSessionId, isPrimary || false, periodsPerWeek || 0]
          );
          created++;
        } else {
          skipped++;
        }
      }

      res.json({ success: true, message: `Assigned to ${created} classes, skipped ${skipped}` });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Bulk assign subject to classes error:', error);
    res.status(500).json({ success: false, message: 'Failed', error: error.message });
  }
};

// Transfer assignments from one teacher to another
export const transferAssignments = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { fromTeacherId, toTeacherId, assignmentIds, academicSessionId, transferAll } = req.body;

    if (!fromTeacherId || !toTeacherId || !academicSessionId) {
      return res.status(400).json({ success: false, message: 'From teacher, to teacher, and session are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let whereClause = `WHERE teacher_id = $1 AND academic_session_id = $2`;
      const params = [fromTeacherId, academicSessionId];

      if (!transferAll && assignmentIds && assignmentIds.length > 0) {
        whereClause += ` AND id = ANY($3)`;
        params.push(assignmentIds);
      }

      // Check for conflicts
      const toTransfer = await dbClient.query(
        `SELECT * FROM teacher_subjects ${whereClause}`,
        params
      );

      let transferred = 0;
      let skipped = 0;

      for (const assignment of toTransfer.rows) {
        // Check if destination teacher already has this
        const existing = await dbClient.query(
          `SELECT id FROM teacher_subjects 
           WHERE teacher_id = $1 AND subject_id = $2 AND class_section_id IS NOT DISTINCT FROM $3 AND academic_session_id = $4`,
          [toTeacherId, assignment.subject_id, assignment.class_section_id, academicSessionId]
        );

        if (existing.rows.length === 0) {
          await dbClient.query(
            `UPDATE teacher_subjects SET teacher_id = $1 WHERE id = $2`,
            [toTeacherId, assignment.id]
          );
          transferred++;
        } else {
          // Delete the old one since destination already has it
          await dbClient.query(`DELETE FROM teacher_subjects WHERE id = $1`, [assignment.id]);
          skipped++;
        }
      }

      res.json({
        success: true,
        message: `Transferred ${transferred} assignments, skipped ${skipped} (already assigned to destination)`,
        data: { transferred, skipped }
      });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Transfer assignments error:', error);
    res.status(500).json({ success: false, message: 'Failed to transfer', error: error.message });
  }
};

// Copy assignments to new academic session
export const copyAssignmentsToSession = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { fromSessionId, toSessionId, teacherIds } = req.body;

    if (!fromSessionId || !toSessionId) {
      return res.status(400).json({ success: false, message: 'Source and target sessions are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get class section mapping (old session -> new session)
      const oldClassSections = await dbClient.query(
        `SELECT cs.id, cg.name as class_name, s.name as section_name
         FROM class_sections cs
         JOIN class_grades cg ON cs.class_grade_id = cg.id
         JOIN sections s ON cs.section_id = s.id
         WHERE cs.academic_session_id = $1`,
        [fromSessionId]
      );

      const newClassSections = await dbClient.query(
        `SELECT cs.id, cg.name as class_name, s.name as section_name
         FROM class_sections cs
         JOIN class_grades cg ON cs.class_grade_id = cg.id
         JOIN sections s ON cs.section_id = s.id
         WHERE cs.academic_session_id = $1`,
        [toSessionId]
      );

      const classMap = {};
      for (const oldCs of oldClassSections.rows) {
        const newCs = newClassSections.rows.find(
          n => n.class_name === oldCs.class_name && n.section_name === oldCs.section_name
        );
        if (newCs) {
          classMap[oldCs.id] = newCs.id;
        }
      }

      // Get assignments to copy
      let assignmentQuery = `SELECT * FROM teacher_subjects WHERE academic_session_id = $1`;
      const params = [fromSessionId];

      if (teacherIds && teacherIds.length > 0) {
        assignmentQuery += ` AND teacher_id = ANY($2)`;
        params.push(teacherIds);
      }

      const assignments = await dbClient.query(assignmentQuery, params);

      let copied = 0;
      let skipped = 0;

      for (const a of assignments.rows) {
        const newClassSectionId = a.class_section_id ? classMap[a.class_section_id] : null;

        // Skip if class section doesn't exist in new session
        if (a.class_section_id && !newClassSectionId) {
          skipped++;
          continue;
        }

        // Check if already exists
        const existing = await dbClient.query(
          `SELECT id FROM teacher_subjects 
           WHERE teacher_id = $1 AND subject_id = $2 AND class_section_id IS NOT DISTINCT FROM $3 AND academic_session_id = $4`,
          [a.teacher_id, a.subject_id, newClassSectionId, toSessionId]
        );

        if (existing.rows.length === 0) {
          await dbClient.query(
            `INSERT INTO teacher_subjects (teacher_id, subject_id, class_section_id, academic_session_id, is_primary, periods_per_week)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [a.teacher_id, a.subject_id, newClassSectionId, toSessionId, a.is_primary, a.periods_per_week]
          );
          copied++;
        } else {
          skipped++;
        }
      }

      res.json({
        success: true,
        message: `Copied ${copied} assignments, skipped ${skipped}`,
        data: { copied, skipped }
      });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Copy assignments to session error:', error);
    res.status(500).json({ success: false, message: 'Failed to copy', error: error.message });
  }
};

// Get vacant positions (subjects/classes without teachers)
export const getVacantPositions = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;

    if (!academic_session_id) {
      return res.status(400).json({ success: false, message: 'Academic session ID is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get all subjects
      const subjects = await dbClient.query(
        `SELECT id, name, code, category FROM subjects WHERE school_id = $1 AND is_active = true`,
        [schoolId]
      );

      // Get all class sections
      const classSections = await dbClient.query(
        `SELECT cs.id, cg.name as class_name, cg.display_name as class_display_name,
                sec.name as section_name, sec.display_name as section_display_name
         FROM class_sections cs
         JOIN class_grades cg ON cs.class_grade_id = cg.id
         JOIN sections sec ON cs.section_id = sec.id
         WHERE cs.academic_session_id = $1 AND cs.is_active = true`,
        [academic_session_id]
      );

      // Get curriculum (which subjects are assigned to which classes)
      const curriculum = await dbClient.query(
        `SELECT subject_id, class_section_id FROM class_subjects WHERE academic_session_id = $1`,
        [academic_session_id]
      );

      // Get existing assignments
      const assignments = await dbClient.query(
        `SELECT subject_id, class_section_id FROM teacher_subjects WHERE academic_session_id = $1`,
        [academic_session_id]
      );

      const assignmentSet = new Set(
        assignments.rows.map(a => `${a.subject_id}-${a.class_section_id || 'all'}`)
      );

      // Find vacant positions
      const vacantPositions = [];

      for (const curr of curriculum.rows) {
        const key = `${curr.subject_id}-${curr.class_section_id || 'all'}`;
        if (!assignmentSet.has(key)) {
          const subject = subjects.rows.find(s => s.id === curr.subject_id);
          const classSection = classSections.rows.find(cs => cs.id === curr.class_section_id);
          
          if (subject) {
            vacantPositions.push({
              subjectId: curr.subject_id,
              subjectName: subject.name,
              subjectCode: subject.code,
              category: subject.category,
              classSectionId: curr.class_section_id,
              classSection: classSection 
                ? `${classSection.class_display_name || classSection.class_name} - ${classSection.section_display_name || classSection.section_name}`
                : 'All Classes'
            });
          }
        }
      }

      res.json({
        success: true,
        data: {
          totalVacant: vacantPositions.length,
          positions: vacantPositions
        }
      });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get vacant positions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch', error: error.message });
  }
};

// Get workload summary for dashboard
export const getWorkloadSummary = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;

    if (!academic_session_id) {
      return res.status(400).json({ success: false, message: 'Academic session ID is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT 
          t.id as teacher_id,
          t.first_name || ' ' || COALESCE(t.last_name, '') as teacher_name,
          t.department,
          COUNT(ts.id) as total_assignments,
          SUM(COALESCE(ts.periods_per_week, 0)) as total_periods,
          COUNT(CASE WHEN ts.is_primary THEN 1 END) as primary_count
         FROM teachers t
         LEFT JOIN teacher_subjects ts ON t.id = ts.teacher_id AND ts.academic_session_id = $1
         WHERE t.school_id = $2 AND t.is_active = true
         GROUP BY t.id, t.first_name, t.last_name, t.department
         ORDER BY total_periods DESC`,
        [academic_session_id, schoolId]
      );

      const overloaded = result.rows.filter(r => parseInt(r.total_periods) > 30);
      const heavy = result.rows.filter(r => parseInt(r.total_periods) > 20 && parseInt(r.total_periods) <= 30);
      const unassigned = result.rows.filter(r => parseInt(r.total_assignments) === 0);

      res.json({
        success: true,
        data: {
          summary: {
            totalTeachers: result.rows.length,
            overloadedCount: overloaded.length,
            heavyLoadCount: heavy.length,
            unassignedCount: unassigned.length,
            averagePeriods: result.rows.length > 0 
              ? Math.round(result.rows.reduce((sum, r) => sum + parseInt(r.total_periods || 0), 0) / result.rows.length)
              : 0
          },
          overloadedTeachers: overloaded.map(r => ({ id: r.teacher_id, name: r.teacher_name?.trim(), periods: parseInt(r.total_periods) })),
          unassignedTeachers: unassigned.map(r => ({ id: r.teacher_id, name: r.teacher_name?.trim(), department: r.department })),
          allTeachers: result.rows.map(r => ({
            teacherId: r.teacher_id,
            teacherName: r.teacher_name?.trim(),
            department: r.department,
            totalAssignments: parseInt(r.total_assignments),
            totalPeriods: parseInt(r.total_periods),
            primaryCount: parseInt(r.primary_count),
            status: parseInt(r.total_periods) > 30 ? 'overloaded' 
              : parseInt(r.total_periods) > 20 ? 'heavy'
              : parseInt(r.total_periods) > 10 ? 'moderate'
              : parseInt(r.total_assignments) === 0 ? 'unassigned'
              : 'light'
          }))
        }
      });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get workload summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch', error: error.message });
  }
};

// Update assignment (periods, primary status)
export const updateAssignment = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id } = req.params;
    const { isPrimary, periodsPerWeek } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get current assignment
      const current = await dbClient.query(`SELECT * FROM teacher_subjects WHERE id = $1`, [id]);
      if (current.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      const assignment = current.rows[0];

      // If setting as primary, demote others
      if (isPrimary && assignment.class_section_id) {
        await dbClient.query(
          `UPDATE teacher_subjects SET is_primary = false 
           WHERE subject_id = $1 AND class_section_id = $2 AND academic_session_id = $3 AND is_primary = true AND id != $4`,
          [assignment.subject_id, assignment.class_section_id, assignment.academic_session_id, id]
        );
      }

      await dbClient.query(
        `UPDATE teacher_subjects SET is_primary = COALESCE($1, is_primary), periods_per_week = COALESCE($2, periods_per_week) WHERE id = $3`,
        [isPrimary, periodsPerWeek, id]
      );

      res.json({ success: true, message: 'Assignment updated' });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Update assignment error:', error);
    res.status(500).json({ success: false, message: 'Failed to update', error: error.message });
  }
};

// Delete assignment
export const deleteAssignment = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(`DELETE FROM teacher_subjects WHERE id = $1`, [id]);
      res.json({ success: true, message: 'Assignment deleted' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete', error: error.message });
  }
};

// Bulk delete assignments
export const bulkDeleteAssignments = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { assignmentIds } = req.body;

    if (!assignmentIds || !Array.isArray(assignmentIds)) {
      return res.status(400).json({ success: false, message: 'Assignment IDs array is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(`DELETE FROM teacher_subjects WHERE id = ANY($1)`, [assignmentIds]);
      res.json({ success: true, message: `Deleted ${assignmentIds.length} assignments` });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Bulk delete assignments error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete', error: error.message });
  }
};

