import { getGroupDbClient } from '../lib/groupDb.js';

// =====================================================
// TEACHER LEAVE MANAGEMENT
// =====================================================

/**
 * Get all teacher leaves with optional filters
 */
export const getLeaves = async (req, res) => {
  const { groupId, schoolId } = req.user;
  const { 
    teacher_id, 
    status, 
    start_date, 
    end_date, 
    leave_type,
    date // Get leaves for a specific date
  } = req.query;

  const dbClient = await getGroupDbClient(groupId);

  try {
    let query = `
      SELECT 
        tl.*,
        t.first_name || ' ' || COALESCE(t.last_name, '') as teacher_name,
        t.employee_id,
        t.designation,
        t.department
      FROM teacher_leaves tl
      JOIN teachers t ON tl.teacher_id = t.id
      WHERE tl.school_id = $1
    `;
    const params = [schoolId];
    let paramIndex = 2;

    if (teacher_id) {
      query += ` AND tl.teacher_id = $${paramIndex}`;
      params.push(teacher_id);
      paramIndex++;
    }

    if (status) {
      query += ` AND tl.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (leave_type) {
      query += ` AND tl.leave_type = $${paramIndex}`;
      params.push(leave_type);
      paramIndex++;
    }

    // Filter by date range
    if (start_date) {
      query += ` AND tl.end_date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      query += ` AND tl.start_date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    // Filter for a specific date (leaves that include this date)
    if (date) {
      query += ` AND $${paramIndex}::date BETWEEN tl.start_date AND tl.end_date`;
      params.push(date);
      paramIndex++;
    }

    query += ` ORDER BY tl.start_date DESC`;

    const result = await dbClient.query(query, params);

    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        teacherId: row.teacher_id,
        teacherName: row.teacher_name?.trim(),
        employeeId: row.employee_id,
        designation: row.designation,
        department: row.department,
        leaveType: row.leave_type,
        startDate: row.start_date,
        endDate: row.end_date,
        reason: row.reason,
        status: row.status,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at,
        remarks: row.remarks,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching teacher leaves:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch teacher leaves',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

/**
 * Get teachers on leave for a specific date
 * Uses the existing teacher_leave_applications table with status = 'approved'
 */
export const getTeachersOnLeave = async (req, res) => {
  const { groupId, schoolId } = req.user;
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({
      success: false,
      message: 'Date is required',
    });
  }

  const dbClient = await getGroupDbClient(groupId);

  try {
    // First try the teacher_leave_applications table (existing system)
    let result;
    try {
      const query = `
        SELECT 
          la.id as leave_id,
          la.teacher_id,
          lt.code as leave_type,
          lt.name as leave_type_name,
          la.from_date as start_date,
          la.to_date as end_date,
          la.reason,
          t.first_name,
          t.last_name,
          t.first_name || ' ' || COALESCE(t.last_name, '') as teacher_name,
          t.employee_id,
          t.designation,
          t.department
        FROM teacher_leave_applications la
        JOIN teachers t ON la.teacher_id = t.id
        JOIN teacher_leave_types lt ON la.leave_type_id = lt.id
        WHERE la.school_id = $1
          AND la.status = 'approved'
          AND $2::date BETWEEN la.from_date AND la.to_date
        ORDER BY t.first_name ASC
      `;
      result = await dbClient.query(query, [schoolId, date]);
    } catch (e) {
      // If the table doesn't exist, try the simple teacher_leaves table
      console.log('Falling back to teacher_leaves table:', e.message);
      const fallbackQuery = `
        SELECT 
          tl.id as leave_id,
          tl.teacher_id,
          tl.leave_type,
          tl.leave_type as leave_type_name,
          tl.start_date,
          tl.end_date,
          tl.reason,
          t.first_name,
          t.last_name,
          t.first_name || ' ' || COALESCE(t.last_name, '') as teacher_name,
          t.employee_id,
          t.designation,
          t.department
        FROM teacher_leaves tl
        JOIN teachers t ON tl.teacher_id = t.id
        WHERE tl.school_id = $1
          AND tl.status = 'approved'
          AND $2::date BETWEEN tl.start_date AND tl.end_date
        ORDER BY t.first_name ASC
      `;
      result = await dbClient.query(fallbackQuery, [schoolId, date]);
    }

    res.json({
      success: true,
      data: result.rows.map(row => ({
        leaveId: row.leave_id,
        teacherId: row.teacher_id,
        teacherName: row.teacher_name?.trim(),
        firstName: row.first_name,
        lastName: row.last_name,
        employeeId: row.employee_id,
        designation: row.designation,
        department: row.department,
        leaveType: row.leave_type,
        leaveTypeName: row.leave_type_name,
        startDate: row.start_date,
        endDate: row.end_date,
        reason: row.reason,
      })),
      count: result.rows.length,
    });
  } catch (error) {
    console.error('Error fetching teachers on leave:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch teachers on leave',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

/**
 * Create a new leave request
 */
export const createLeave = async (req, res) => {
  const { groupId, schoolId, user_id } = req.user;
  const {
    teacherId,
    leaveType,
    startDate,
    endDate,
    reason,
    status = 'approved', // Default to approved for admin-created leaves
  } = req.body;

  if (!teacherId || !leaveType || !startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: 'Teacher ID, leave type, start date, and end date are required',
    });
  }

  const dbClient = await getGroupDbClient(groupId);

  try {
    // Check for overlapping leaves
    const overlapCheck = await dbClient.query(`
      SELECT id FROM teacher_leaves
      WHERE school_id = $1
        AND teacher_id = $2
        AND status != 'rejected'
        AND (
          (start_date <= $3 AND end_date >= $3)
          OR (start_date <= $4 AND end_date >= $4)
          OR (start_date >= $3 AND end_date <= $4)
        )
    `, [schoolId, teacherId, startDate, endDate]);

    if (overlapCheck.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Teacher already has a leave during this period',
      });
    }

    const result = await dbClient.query(`
      INSERT INTO teacher_leaves (
        school_id, teacher_id, leave_type, start_date, end_date,
        reason, status, approved_by, approved_at, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      schoolId, teacherId, leaveType, startDate, endDate,
      reason, status, 
      status === 'approved' ? user_id : null,
      status === 'approved' ? new Date() : null,
      user_id
    ]);

    res.status(201).json({
      success: true,
      message: 'Leave created successfully',
      data: {
        id: result.rows[0].id,
        teacherId: result.rows[0].teacher_id,
        leaveType: result.rows[0].leave_type,
        startDate: result.rows[0].start_date,
        endDate: result.rows[0].end_date,
        reason: result.rows[0].reason,
        status: result.rows[0].status,
      },
    });
  } catch (error) {
    console.error('Error creating teacher leave:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create leave',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

/**
 * Update a leave request
 */
export const updateLeave = async (req, res) => {
  const { groupId, schoolId, user_id } = req.user;
  const { id } = req.params;
  const updates = req.body;

  const dbClient = await getGroupDbClient(groupId);

  try {
    // Build dynamic update query
    const updateFields = [];
    const params = [id, schoolId];
    let paramIndex = 3;

    const allowedFields = ['leave_type', 'start_date', 'end_date', 'reason', 'status', 'remarks'];
    const fieldMapping = {
      leaveType: 'leave_type',
      startDate: 'start_date',
      endDate: 'end_date',
    };

    for (const [key, value] of Object.entries(updates)) {
      const dbField = fieldMapping[key] || key;
      if (allowedFields.includes(dbField)) {
        updateFields.push(`${dbField} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }
    }

    // Add approval info if status is being changed to approved
    if (updates.status === 'approved') {
      updateFields.push(`approved_by = $${paramIndex}`);
      params.push(user_id);
      paramIndex++;
      updateFields.push(`approved_at = $${paramIndex}`);
      params.push(new Date());
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update',
      });
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await dbClient.query(`
      UPDATE teacher_leaves
      SET ${updateFields.join(', ')}
      WHERE id = $1 AND school_id = $2
      RETURNING *
    `, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave not found',
      });
    }

    res.json({
      success: true,
      message: 'Leave updated successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating teacher leave:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update leave',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

/**
 * Delete a leave request
 */
export const deleteLeave = async (req, res) => {
  const { groupId, schoolId } = req.user;
  const { id } = req.params;

  const dbClient = await getGroupDbClient(groupId);

  try {
    const result = await dbClient.query(`
      DELETE FROM teacher_leaves
      WHERE id = $1 AND school_id = $2
      RETURNING id
    `, [id, schoolId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Leave not found',
      });
    }

    res.json({
      success: true,
      message: 'Leave deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting teacher leave:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete leave',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

export default {
  getLeaves,
  getTeachersOnLeave,
  createLeave,
  updateLeave,
  deleteLeave,
};

