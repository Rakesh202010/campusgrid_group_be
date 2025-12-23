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

      // 2. Class conflict - same class can't have two subjects at same time
      if (classSectionId) {
        const classConflict = await dbClient.query(
          `SELECT te.*, s.name as subject_name
          FROM timetable_entries te
          LEFT JOIN subjects s ON te.subject_id = s.id
          WHERE te.school_id = $1 AND te.academic_session_id = $2 
            AND te.day_of_week = $3 AND te.period_number = $4 
            AND te.class_section_id = $5 AND te.is_active = true`,
          [schoolId, academicSessionId, dayOfWeek, periodNumber, classSectionId]
        );

        if (classConflict.rows.length > 0) {
          // Update existing entry instead of creating new one
          const existingId = classConflict.rows[0].id;
          const result = await dbClient.query(
            `UPDATE timetable_entries SET
              teacher_id = $1, subject_id = $2, room = $3, notes = $4, period_id = $5, updated_at = CURRENT_TIMESTAMP
            WHERE id = $6 RETURNING *`,
            [teacherId || null, subjectId || null, room || null, notes || null, periodId || null, existingId]
          );

          return res.json({ success: true, message: 'Timetable entry updated.', data: result.rows[0] });
        }
      }

      // Insert new entry
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
        RETURNING *`,
        [schoolId, academicSessionId, dayOfWeek, periodNumber, periodId || null, 
         teacherId || null, classSectionId || null, subjectId || null, room || null, notes || null]
      );

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

      for (const entry of entries) {
        try {
          await dbClient.query(
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
              updated_at = CURRENT_TIMESTAMP`,
            [schoolId, academicSessionId, entry.dayOfWeek, entry.periodNumber, entry.periodId || null,
             entry.teacherId || null, entry.classSectionId || null, entry.subjectId || null, 
             entry.room || null, entry.notes || null]
          );
          saved++;
        } catch (e) {
          errors.push({ entry, error: e.message });
        }
      }

      res.json({ success: true, message: `Saved ${saved} entries.`, errors });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error bulk saving timetable:', error);
    res.status(500).json({ success: false, message: 'Failed to save timetable.' });
  }
};

