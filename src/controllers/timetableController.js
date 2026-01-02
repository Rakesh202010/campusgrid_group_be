import { getGroupDbClient } from '../lib/groupDb.js';

// =====================================================
// TIMETABLE ENTRIES CRUD
// =====================================================

// Get timetable for a teacher
export const getTeacherTimetable = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { teacherId } = req.params;
    const { academic_session_id } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT te.*,
          s.name as subject_name, s.code as subject_code,
          cs.id as class_section_id,
          cg.name as grade_name, cg.display_name as grade_display_name,
          sec.name as section_name,
          cp.name as period_name, cp.start_time, cp.end_time
        FROM timetable_entries te
        LEFT JOIN subjects s ON te.subject_id = s.id
        LEFT JOIN class_sections cs ON te.class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        LEFT JOIN class_periods cp ON te.period_id = cp.id
        WHERE te.school_id = $1 AND te.teacher_id = $2 AND te.academic_session_id = $3 AND te.is_active = true
        ORDER BY te.day_of_week, te.period_number`,
        [schoolId, teacherId, academic_session_id]
      );

      // Convert to a map format for frontend
      const timetableMap = {};
      result.rows.forEach(row => {
        const key = `${row.day_of_week}-${row.period_number}`;
        timetableMap[key] = {
          id: row.id,
          dayOfWeek: row.day_of_week,
          periodNumber: row.period_number,
          periodId: row.period_id,
          periodName: row.period_name,
          startTime: row.start_time,
          endTime: row.end_time,
          teacherId: row.teacher_id,
          classSectionId: row.class_section_id,
          className: row.grade_display_name || row.grade_name,
          sectionName: row.section_name,
          subjectId: row.subject_id,
          subjectName: row.subject_name,
          subjectCode: row.subject_code,
          room: row.room,
          notes: row.notes
        };
      });

      res.json({ success: true, data: timetableMap });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting teacher timetable:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve timetable.' });
  }
};

// Get timetable for a class
export const getClassTimetable = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { classSectionId } = req.params;
    const { academic_session_id } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT te.*,
          s.name as subject_name, s.code as subject_code,
          t.first_name as teacher_first_name, t.last_name as teacher_last_name,
          cp.name as period_name, cp.start_time, cp.end_time
        FROM timetable_entries te
        LEFT JOIN subjects s ON te.subject_id = s.id
        LEFT JOIN teachers t ON te.teacher_id = t.id
        LEFT JOIN class_periods cp ON te.period_id = cp.id
        WHERE te.school_id = $1 AND te.class_section_id = $2 AND te.academic_session_id = $3 AND te.is_active = true
        ORDER BY te.day_of_week, te.period_number`,
        [schoolId, classSectionId, academic_session_id]
      );

      // Convert to a map format for frontend
      const timetableMap = {};
      result.rows.forEach(row => {
        const key = `${row.day_of_week}-${row.period_number}`;
        timetableMap[key] = {
          id: row.id,
          dayOfWeek: row.day_of_week,
          periodNumber: row.period_number,
          periodId: row.period_id,
          periodName: row.period_name,
          startTime: row.start_time,
          endTime: row.end_time,
          teacherId: row.teacher_id,
          teacherName: `${row.teacher_first_name || ''} ${row.teacher_last_name || ''}`.trim(),
          classSectionId: row.class_section_id,
          subjectId: row.subject_id,
          subjectName: row.subject_name,
          subjectCode: row.subject_code,
          room: row.room,
          notes: row.notes
        };
      });

      res.json({ success: true, data: timetableMap });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting class timetable:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve timetable.' });
  }
};

// Add or update a timetable entry
export const saveTimetableEntry = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const {
      academicSessionId, dayOfWeek, periodNumber, periodId,
      teacherId, classSectionId, subjectId, room, notes
    } = req.body;

    if (!academicSessionId || !dayOfWeek || periodNumber === undefined) {
      return res.status(400).json({ success: false, message: 'Academic session, day, and period are required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for conflicts
      // 1. Teacher conflict - same teacher can't be in two places at same time
      if (teacherId) {
        const teacherConflict = await dbClient.query(
          `SELECT te.*, cs.id as class_section_id,
            cg.display_name as grade_name, sec.name as section_name
          FROM timetable_entries te
          LEFT JOIN class_sections cs ON te.class_section_id = cs.id
          LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
          LEFT JOIN sections sec ON cs.section_id = sec.id
          WHERE te.school_id = $1 AND te.academic_session_id = $2 
            AND te.day_of_week = $3 AND te.period_number = $4 
            AND te.teacher_id = $5 AND te.class_section_id != $6
            AND te.is_active = true`,
          [schoolId, academicSessionId, dayOfWeek, periodNumber, teacherId, classSectionId || '00000000-0000-0000-0000-000000000000']
        );

        if (teacherConflict.rows.length > 0) {
          const conflict = teacherConflict.rows[0];
          return res.status(400).json({
            success: false,
            message: `Teacher already assigned to ${conflict.grade_name} ${conflict.section_name} during this period.`
          });
        }
      }

      // 2. Class conflict - same class can't have two different teachers at same time
      if (classSectionId) {
        const classConflict = await dbClient.query(
          `SELECT te.*, s.name as subject_name,
            t.first_name as teacher_first_name, t.last_name as teacher_last_name
          FROM timetable_entries te
          LEFT JOIN subjects s ON te.subject_id = s.id
          LEFT JOIN teachers t ON te.teacher_id = t.id
          WHERE te.school_id = $1 AND te.academic_session_id = $2 
            AND te.day_of_week = $3 AND te.period_number = $4 
            AND te.class_section_id = $5`,
          [schoolId, academicSessionId, dayOfWeek, periodNumber, classSectionId]
        );

        if (classConflict.rows.length > 0) {
          const existingEntry = classConflict.rows[0];
          const existingTeacherId = existingEntry.teacher_id ? String(existingEntry.teacher_id) : null;
          const newTeacherId = teacherId ? String(teacherId) : null;
          
          // If a different teacher is already assigned, prevent the assignment
          if (existingTeacherId && newTeacherId && existingTeacherId !== newTeacherId) {
            const existingTeacherName = `${existingEntry.teacher_first_name || ''} ${existingEntry.teacher_last_name || ''}`.trim();
            return res.status(400).json({
              success: false,
              message: `This period already has ${existingTeacherName} assigned${existingEntry.subject_name ? ` for ${existingEntry.subject_name}` : ''}. Please remove the existing assignment first before assigning a different teacher.`,
              existingTeacher: {
                id: existingEntry.teacher_id,
                name: existingTeacherName
              }
            });
          }
          
          // Update existing entry (same teacher or no teacher conflict)
          const existingId = existingEntry.id;
          const result = await dbClient.query(
            `UPDATE timetable_entries SET
              teacher_id = $1, subject_id = $2, room = $3, notes = $4, period_id = $5, updated_at = CURRENT_TIMESTAMP
            WHERE id = $6 RETURNING *`,
            [teacherId || null, subjectId || null, room || null, notes || null, periodId || null, existingId]
          );

          return res.json({ success: true, message: 'Timetable entry updated.', data: result.rows[0] });
        }
      }

      // Insert new entry - check for existing entry with different teacher first (handles case when classSectionId was not provided above)
      if (classSectionId && teacherId) {
        const existingWithDifferentTeacher = await dbClient.query(
          `SELECT te.teacher_id, t.first_name, t.last_name, s.name as subject_name
          FROM timetable_entries te
          LEFT JOIN teachers t ON te.teacher_id = t.id
          LEFT JOIN subjects s ON te.subject_id = s.id
          WHERE te.school_id = $1 AND te.academic_session_id = $2 
            AND te.day_of_week = $3 AND te.period_number = $4 
            AND te.class_section_id = $5 
            AND te.teacher_id IS NOT NULL AND te.teacher_id != $6`,
          [schoolId, academicSessionId, dayOfWeek, periodNumber, classSectionId, teacherId]
        );
        
        if (existingWithDifferentTeacher.rows.length > 0) {
          const existing = existingWithDifferentTeacher.rows[0];
          const existingTeacherName = `${existing.first_name || ''} ${existing.last_name || ''}`.trim();
          return res.status(400).json({
            success: false,
            message: `This period already has ${existingTeacherName} assigned${existing.subject_name ? ` for ${existing.subject_name}` : ''}. Please remove the existing assignment first before assigning a different teacher.`,
            existingTeacher: {
              id: existing.teacher_id,
              name: existingTeacherName
            }
          });
        }
      }

      // Only insert if there's no conflicting entry, or update if same teacher
      const result = await dbClient.query(
        `INSERT INTO timetable_entries (
          school_id, academic_session_id, day_of_week, period_number, period_id,
          teacher_id, class_section_id, subject_id, room, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (school_id, academic_session_id, day_of_week, period_number, class_section_id) 
        DO UPDATE SET
          teacher_id = EXCLUDED.teacher_id,
          subject_id = EXCLUDED.subject_id,
          room = EXCLUDED.room,
          notes = EXCLUDED.notes,
          period_id = EXCLUDED.period_id,
          updated_at = CURRENT_TIMESTAMP
        WHERE timetable_entries.teacher_id IS NULL 
           OR timetable_entries.teacher_id = EXCLUDED.teacher_id
        RETURNING *`,
        [schoolId, academicSessionId, dayOfWeek, periodNumber, periodId || null, 
         teacherId || null, classSectionId || null, subjectId || null, room || null, notes || null]
      );

      // If no rows returned, it means there's a conflict with a different teacher
      if (result.rows.length === 0) {
        // Fetch the existing entry to get teacher info for error message
        const existingEntry = await dbClient.query(
          `SELECT te.teacher_id, t.first_name, t.last_name, s.name as subject_name
           FROM timetable_entries te
           LEFT JOIN teachers t ON te.teacher_id = t.id
           LEFT JOIN subjects s ON te.subject_id = s.id
           WHERE te.school_id = $1 AND te.academic_session_id = $2 
             AND te.day_of_week = $3 AND te.period_number = $4 
             AND te.class_section_id = $5`,
          [schoolId, academicSessionId, dayOfWeek, periodNumber, classSectionId]
        );
        
        if (existingEntry.rows.length > 0) {
          const existing = existingEntry.rows[0];
          const existingTeacherName = `${existing.first_name || ''} ${existing.last_name || ''}`.trim();
          return res.status(400).json({
            success: false,
            message: `This period already has ${existingTeacherName} assigned${existing.subject_name ? ` for ${existing.subject_name}` : ''}. Please remove the existing assignment first before assigning a different teacher.`,
            existingTeacher: {
              id: existing.teacher_id,
              name: existingTeacherName
            }
          });
        }
        
        return res.status(400).json({
          success: false,
          message: 'This period already has another teacher assigned. Please remove the existing assignment first.'
        });
      }

      res.status(201).json({ success: true, message: 'Timetable entry saved.', data: result.rows[0] });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error saving timetable entry:', error);
    res.status(500).json({ success: false, message: 'Failed to save timetable entry.' });
  }
};

// Delete a timetable entry
export const deleteTimetableEntry = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM timetable_entries WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Entry not found.' });
      }

      res.json({ success: true, message: 'Timetable entry deleted.' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error deleting timetable entry:', error);
    res.status(500).json({ success: false, message: 'Failed to delete timetable entry.' });
  }
};

// Delete entry by day and period (for easy removal)
export const deleteTimetableByDayPeriod = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academicSessionId, dayOfWeek, periodNumber, teacherId, classSectionId } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `DELETE FROM timetable_entries WHERE school_id = $1 AND academic_session_id = $2 AND day_of_week = $3 AND period_number = $4`;
      const params = [schoolId, academicSessionId, dayOfWeek, periodNumber];

      if (teacherId) {
        params.push(teacherId);
        query += ` AND teacher_id = $${params.length}`;
      }
      if (classSectionId) {
        params.push(classSectionId);
        query += ` AND class_section_id = $${params.length}`;
      }

      query += ' RETURNING id';

      await dbClient.query(query, params);
      res.json({ success: true, message: 'Timetable entry removed.' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error deleting timetable entry:', error);
    res.status(500).json({ success: false, message: 'Failed to delete entry.' });
  }
};

// =====================================================
// DAILY TIMETABLE VIEW (with date-specific substitutions)
// =====================================================

// Get daily timetable for a specific date (with substitutions applied)
export const getDailyTimetable = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { date, teacher_id, class_section_id, academic_session_id } = req.query;

    if (!date || !academic_session_id) {
      return res.status(400).json({ success: false, message: 'Date and academic session are required.' });
    }

    // Get day of week from date
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[new Date(date).getDay()];

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Build query based on filters
      let baseQuery = `
        SELECT te.*,
          s.name as subject_name, s.code as subject_code,
          t.id as teacher_id, t.first_name as teacher_first_name, t.last_name as teacher_last_name, t.employee_id,
          cs.id as class_section_id,
          cg.name as grade_name, cg.display_name as grade_display_name,
          sec.name as section_name,
          cp.name as period_name, cp.start_time, cp.end_time,
          -- Check for date-specific substitution
          ds.id as substitution_id,
          ds.substitute_teacher_id,
          ds.reason as substitution_reason,
          st.first_name as substitute_first_name, st.last_name as substitute_last_name, st.employee_id as substitute_employee_id
        FROM timetable_entries te
        LEFT JOIN subjects s ON te.subject_id = s.id
        LEFT JOIN teachers t ON te.teacher_id = t.id
        LEFT JOIN class_sections cs ON te.class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        LEFT JOIN class_periods cp ON te.period_id = cp.id
        LEFT JOIN timetable_date_substitutions ds ON ds.school_id = te.school_id 
          AND ds.substitution_date = $1 
          AND ds.day_of_week = te.day_of_week 
          AND ds.period_number = te.period_number
          AND ds.class_section_id = te.class_section_id
        LEFT JOIN teachers st ON ds.substitute_teacher_id = st.id
        WHERE te.school_id = $2 AND te.day_of_week = $3 AND te.academic_session_id = $4 AND te.is_active = true
      `;
      const params = [date, schoolId, dayOfWeek, academic_session_id];
      let paramIndex = 5;

      if (teacher_id) {
        // Show entries where this teacher is assigned OR is substituting
        baseQuery += ` AND (te.teacher_id = $${paramIndex} OR ds.substitute_teacher_id = $${paramIndex})`;
        params.push(teacher_id);
        paramIndex++;
      }

      if (class_section_id) {
        baseQuery += ` AND te.class_section_id = $${paramIndex}`;
        params.push(class_section_id);
        paramIndex++;
      }

      baseQuery += ` ORDER BY te.period_number`;

      const result = await dbClient.query(baseQuery, params);

      // Format response
      const entries = result.rows.map(row => ({
        id: row.id,
        dayOfWeek: row.day_of_week,
        periodNumber: row.period_number,
        periodId: row.period_id,
        periodName: row.period_name,
        startTime: row.start_time,
        endTime: row.end_time,
        // Original teacher
        originalTeacherId: row.teacher_id,
        originalTeacherName: `${row.teacher_first_name || ''} ${row.teacher_last_name || ''}`.trim(),
        originalTeacherEmployeeId: row.employee_id,
        // Effective teacher (substitute if exists, else original)
        effectiveTeacherId: row.substitute_teacher_id || row.teacher_id,
        effectiveTeacherName: row.substitute_teacher_id 
          ? `${row.substitute_first_name || ''} ${row.substitute_last_name || ''}`.trim()
          : `${row.teacher_first_name || ''} ${row.teacher_last_name || ''}`.trim(),
        isSubstituted: !!row.substitution_id,
        substitutionId: row.substitution_id,
        substitutionReason: row.substitution_reason,
        substituteTeacherId: row.substitute_teacher_id,
        substituteTeacherName: row.substitute_teacher_id 
          ? `${row.substitute_first_name || ''} ${row.substitute_last_name || ''}`.trim()
          : null,
        // Class and subject
        classSectionId: row.class_section_id,
        className: row.grade_display_name || row.grade_name,
        sectionName: row.section_name,
        fullClassName: `${row.grade_display_name || row.grade_name} ${row.section_name}`,
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        subjectCode: row.subject_code,
        room: row.room
      }));

      res.json({ 
        success: true, 
        data: {
          date,
          dayOfWeek,
          entries
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting daily timetable:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve daily timetable.' });
  }
};

// Get available teachers for substitution
export const getAvailableTeachersForSubstitution = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { date, period_number, exclude_teacher_id, academic_session_id } = req.query;

    if (!date || !period_number || !academic_session_id) {
      return res.status(400).json({ success: false, message: 'Date, period, and academic session are required.' });
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[new Date(date).getDay()];

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Find teachers who are NOT busy during this period on this day
      const query = `
        WITH busy_teachers AS (
          -- Teachers with regular timetable entries at this period
          SELECT DISTINCT teacher_id FROM timetable_entries
          WHERE school_id = $1 AND day_of_week = $2 AND period_number = $3 
            AND academic_session_id = $4 AND is_active = true
          UNION
          -- Teachers already substituting on this date/period
          SELECT DISTINCT substitute_teacher_id FROM timetable_date_substitutions
          WHERE school_id = $1 AND substitution_date = $5 AND period_number = $3
        )
        SELECT t.id, t.first_name, t.last_name, t.employee_id, t.department,
          (SELECT COUNT(*) FROM timetable_entries te 
           WHERE te.teacher_id = t.id AND te.day_of_week = $2 AND te.is_active = true) as periods_on_day,
          (SELECT COUNT(*) FROM timetable_date_substitutions ds 
           WHERE ds.substitute_teacher_id = t.id AND ds.substitution_date = $5) as substitutions_today
        FROM teachers t
        WHERE t.school_id = $1 
          AND t.status = 'active'
          AND t.id NOT IN (SELECT teacher_id FROM busy_teachers WHERE teacher_id IS NOT NULL)
          ${exclude_teacher_id ? 'AND t.id != $6' : ''}
        ORDER BY periods_on_day ASC, substitutions_today ASC, t.first_name
      `;

      const params = [schoolId, dayOfWeek, period_number, academic_session_id, date];
      if (exclude_teacher_id) params.push(exclude_teacher_id);

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(t => ({
          id: t.id,
          name: `${t.first_name} ${t.last_name}`,
          employeeId: t.employee_id,
          department: t.department,
          periodsOnDay: parseInt(t.periods_on_day) || 0,
          substitutionsToday: parseInt(t.substitutions_today) || 0,
          totalLoadToday: (parseInt(t.periods_on_day) || 0) + (parseInt(t.substitutions_today) || 0)
        }))
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting available teachers:', error);
    res.status(500).json({ success: false, message: 'Failed to find available teachers.' });
  }
};

// Create a date-specific substitution with comprehensive validation
export const createSubstitution = async (req, res) => {
  try {
    const { groupId, schoolId, userId } = req.user;
    const { 
      academicSessionId, date, dayOfWeek, periodNumber, 
      originalTeacherId, substituteTeacherId, classSectionId, subjectId, reason 
    } = req.body;

    if (!date || !substituteTeacherId || periodNumber === undefined) {
      return res.status(400).json({ success: false, message: 'Date, substitute teacher, and period are required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // =====================================================
      // VALIDATION 1: Check if substitute teacher exists and is active
      // =====================================================
      const teacherCheck = await dbClient.query(
        `SELECT id, first_name, last_name, status FROM teachers WHERE id = $1 AND school_id = $2`,
        [substituteTeacherId, schoolId]
      );

      if (teacherCheck.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Substitute teacher not found.' });
      }

      const substituteTeacher = teacherCheck.rows[0];
      if (substituteTeacher.status !== 'active') {
        return res.status(400).json({ 
          success: false, 
          message: `${substituteTeacher.first_name} ${substituteTeacher.last_name} is not active (Status: ${substituteTeacher.status}).` 
        });
      }

      // =====================================================
      // VALIDATION 2: Check if teacher has a regular class at this time
      // =====================================================
      const regularClassCheck = await dbClient.query(
        `SELECT te.id, cg.display_name as grade_name, sec.name as section_name, s.name as subject_name
         FROM timetable_entries te
         LEFT JOIN class_sections cs ON te.class_section_id = cs.id
         LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
         LEFT JOIN sections sec ON cs.section_id = sec.id
         LEFT JOIN subjects s ON te.subject_id = s.id
         WHERE te.school_id = $1 
           AND te.teacher_id = $2 
           AND te.day_of_week = $3 
           AND te.period_number = $4
           AND te.is_active = true`,
        [schoolId, substituteTeacherId, dayOfWeek, periodNumber]
      );

      if (regularClassCheck.rows.length > 0) {
        const conflictClass = regularClassCheck.rows[0];
        return res.status(400).json({ 
          success: false, 
          message: `${substituteTeacher.first_name} ${substituteTeacher.last_name} is already assigned to ${conflictClass.grade_name} ${conflictClass.section_name} (${conflictClass.subject_name || 'No subject'}) during Period ${periodNumber}.` 
        });
      }

      // =====================================================
      // VALIDATION 3: Check if teacher is already substituting elsewhere
      // =====================================================
      const existingSubCheck = await dbClient.query(
        `SELECT ds.id, cg.display_name as grade_name, sec.name as section_name
         FROM timetable_date_substitutions ds
         LEFT JOIN class_sections cs ON ds.class_section_id = cs.id
         LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
         LEFT JOIN sections sec ON cs.section_id = sec.id
         WHERE ds.school_id = $1 
           AND ds.substitute_teacher_id = $2 
           AND ds.substitution_date = $3 
           AND ds.period_number = $4`,
        [schoolId, substituteTeacherId, date, periodNumber]
      );

      if (existingSubCheck.rows.length > 0) {
        const existingSub = existingSubCheck.rows[0];
        return res.status(400).json({ 
          success: false, 
          message: `${substituteTeacher.first_name} ${substituteTeacher.last_name} is already substituting for ${existingSub.grade_name} ${existingSub.section_name} during Period ${periodNumber} on this date.` 
        });
      }

      // =====================================================
      // VALIDATION 5: Cannot substitute for yourself
      // =====================================================
      if (originalTeacherId && originalTeacherId === substituteTeacherId) {
        return res.status(400).json({ 
          success: false, 
          message: 'A teacher cannot substitute for themselves.' 
        });
      }

      // =====================================================
      // ALL VALIDATIONS PASSED - Create the substitution
      // =====================================================
      const result = await dbClient.query(
        `INSERT INTO timetable_date_substitutions (
          school_id, academic_session_id, substitution_date, day_of_week, period_number,
          original_teacher_id, substitute_teacher_id, class_section_id, subject_id, reason, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (school_id, substitution_date, day_of_week, period_number, class_section_id) 
        DO UPDATE SET
          substitute_teacher_id = EXCLUDED.substitute_teacher_id,
          reason = EXCLUDED.reason
        RETURNING *`,
        [schoolId, academicSessionId, date, dayOfWeek, periodNumber, 
         originalTeacherId || null, substituteTeacherId, classSectionId || null, subjectId || null, reason || null, userId]
      );

      res.status(201).json({ 
        success: true, 
        message: `${substituteTeacher.first_name} ${substituteTeacher.last_name} assigned as substitute for Period ${periodNumber}.`, 
        data: result.rows[0] 
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error creating substitution:', error);
    res.status(500).json({ success: false, message: 'Failed to assign substitute.' });
  }
};

// Remove a date-specific substitution
export const removeSubstitution = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM timetable_date_substitutions WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Substitution not found.' });
      }

      res.json({ success: true, message: 'Substitution removed. Original teacher restored.' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error removing substitution:', error);
    res.status(500).json({ success: false, message: 'Failed to remove substitution.' });
  }
};

// Get all substitutions for a date
export const getSubstitutionsForDate = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT ds.*,
          ot.first_name as original_first_name, ot.last_name as original_last_name,
          st.first_name as substitute_first_name, st.last_name as substitute_last_name,
          s.name as subject_name,
          cg.display_name as grade_name, sec.name as section_name
        FROM timetable_date_substitutions ds
        LEFT JOIN teachers ot ON ds.original_teacher_id = ot.id
        LEFT JOIN teachers st ON ds.substitute_teacher_id = st.id
        LEFT JOIN subjects s ON ds.subject_id = s.id
        LEFT JOIN class_sections cs ON ds.class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        WHERE ds.school_id = $1 AND ds.substitution_date = $2
        ORDER BY ds.period_number`,
        [schoolId, date]
      );

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          date: row.substitution_date,
          dayOfWeek: row.day_of_week,
          periodNumber: row.period_number,
          originalTeacher: row.original_first_name ? `${row.original_first_name} ${row.original_last_name}` : 'N/A',
          substituteTeacher: `${row.substitute_first_name} ${row.substitute_last_name}`,
          className: row.grade_name ? `${row.grade_name} ${row.section_name}` : 'N/A',
          subjectName: row.subject_name || 'N/A',
          reason: row.reason
        }))
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting substitutions:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve substitutions.' });
  }
};

// Bulk save timetable (for copy/paste operations)
export const bulkSaveTimetable = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { entries, academicSessionId } = req.body;

    if (!Array.isArray(entries) || !academicSessionId) {
      return res.status(400).json({ success: false, message: 'Entries array and academic session are required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let saved = 0;
      let errors = [];
      let conflicts = [];

      for (const entry of entries) {
        try {
          // Check for teacher conflict - same teacher in two classes at same time
          if (entry.teacherId) {
            const teacherConflict = await dbClient.query(
              `SELECT te.*, cs.id as class_section_id,
                cg.display_name as grade_name, sec.name as section_name
              FROM timetable_entries te
              LEFT JOIN class_sections cs ON te.class_section_id = cs.id
              LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
              LEFT JOIN sections sec ON cs.section_id = sec.id
              WHERE te.school_id = $1 AND te.academic_session_id = $2 
                AND te.day_of_week = $3 AND te.period_number = $4 
                AND te.teacher_id = $5 AND te.class_section_id != $6
                AND te.is_active = true`,
              [schoolId, academicSessionId, entry.dayOfWeek, entry.periodNumber, entry.teacherId, 
               entry.classSectionId || '00000000-0000-0000-0000-000000000000']
            );

            if (teacherConflict.rows.length > 0) {
              const conflict = teacherConflict.rows[0];
              conflicts.push({
                entry,
                message: `Teacher already assigned to ${conflict.grade_name} ${conflict.section_name} during ${entry.dayOfWeek} Period ${entry.periodNumber}`
              });
              continue;
            }
          }

          // Check for class conflict - different teacher already assigned to same class/period
          if (entry.classSectionId && entry.teacherId) {
            const classConflict = await dbClient.query(
              `SELECT te.*, t.first_name, t.last_name
              FROM timetable_entries te
              LEFT JOIN teachers t ON te.teacher_id = t.id
              WHERE te.school_id = $1 AND te.academic_session_id = $2 
                AND te.day_of_week = $3 AND te.period_number = $4 
                AND te.class_section_id = $5 AND te.teacher_id IS NOT NULL
                AND te.teacher_id::text != $6`,
              [schoolId, academicSessionId, entry.dayOfWeek, entry.periodNumber, 
               entry.classSectionId, String(entry.teacherId)]
            );

            if (classConflict.rows.length > 0) {
              const existingTeacher = classConflict.rows[0];
              const teacherName = `${existingTeacher.first_name || ''} ${existingTeacher.last_name || ''}`.trim();
              conflicts.push({
                entry,
                message: `${entry.dayOfWeek} Period ${entry.periodNumber} already has ${teacherName} assigned. Remove existing assignment first.`
              });
              continue;
            }
          }

          const insertResult = await dbClient.query(
            `INSERT INTO timetable_entries (
              school_id, academic_session_id, day_of_week, period_number, period_id,
              teacher_id, class_section_id, subject_id, room, notes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (school_id, academic_session_id, day_of_week, period_number, class_section_id) 
            DO UPDATE SET
              teacher_id = EXCLUDED.teacher_id,
              subject_id = EXCLUDED.subject_id,
              room = EXCLUDED.room,
              notes = EXCLUDED.notes,
              period_id = EXCLUDED.period_id,
              updated_at = CURRENT_TIMESTAMP
            WHERE timetable_entries.teacher_id IS NULL 
               OR timetable_entries.teacher_id = EXCLUDED.teacher_id
            RETURNING id`,
            [schoolId, academicSessionId, entry.dayOfWeek, entry.periodNumber, entry.periodId || null,
             entry.teacherId || null, entry.classSectionId || null, entry.subjectId || null, 
             entry.room || null, entry.notes || null]
          );
          
          if (insertResult.rows.length === 0) {
            // Conflict with different teacher - add to conflicts list
            const existingEntry = await dbClient.query(
              `SELECT t.first_name, t.last_name FROM timetable_entries te
               LEFT JOIN teachers t ON te.teacher_id = t.id
               WHERE te.school_id = $1 AND te.academic_session_id = $2 
                 AND te.day_of_week = $3 AND te.period_number = $4 
                 AND te.class_section_id = $5`,
              [schoolId, academicSessionId, entry.dayOfWeek, entry.periodNumber, entry.classSectionId]
            );
            const teacherName = existingEntry.rows[0] 
              ? `${existingEntry.rows[0].first_name || ''} ${existingEntry.rows[0].last_name || ''}`.trim()
              : 'another teacher';
            conflicts.push({
              entry,
              message: `${entry.dayOfWeek} Period ${entry.periodNumber} already has ${teacherName} assigned.`
            });
          } else {
            saved++;
          }
        } catch (e) {
          errors.push({ entry, error: e.message });
        }
      }

      const hasConflicts = conflicts.length > 0;
      res.json({ 
        success: !hasConflicts || saved > 0, 
        message: hasConflicts 
          ? `Saved ${saved} entries. ${conflicts.length} skipped due to conflicts.` 
          : `Saved ${saved} entries.`, 
        errors,
        conflicts 
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error bulk saving timetable:', error);
    res.status(500).json({ success: false, message: 'Failed to save timetable.' });
  }
};

