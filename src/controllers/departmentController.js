import { getGroupDbClient } from '../lib/groupDb.js';

// =====================================================
// DEPARTMENTS CRUD
// =====================================================

export const getDepartments = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { is_active } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT d.*,
          t.first_name || ' ' || COALESCE(t.last_name, '') as head_teacher_name,
          (SELECT COUNT(*) FROM subjects s WHERE s.department_id = d.id) as subject_count,
          (SELECT COUNT(*) FROM teachers te WHERE te.department = d.name) as teacher_count
        FROM departments d
        LEFT JOIN teachers t ON d.head_teacher_id = t.id
        WHERE d.school_id = $1
      `;
      const params = [schoolId];

      if (is_active !== undefined) {
        params.push(is_active === 'true');
        query += ` AND d.is_active = $${params.length}`;
      }

      query += ' ORDER BY d.order_index, d.name';

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          schoolId: row.school_id,
          name: row.name,
          code: row.code,
          description: row.description,
          headTeacherId: row.head_teacher_id,
          headTeacherName: row.head_teacher_name,
          color: row.color,
          icon: row.icon,
          isActive: row.is_active,
          orderIndex: row.order_index,
          subjectCount: parseInt(row.subject_count) || 0,
          teacherCount: parseInt(row.teacher_count) || 0,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting departments:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve departments.' });
  }
};

export const getDepartmentById = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT d.*,
          t.first_name || ' ' || COALESCE(t.last_name, '') as head_teacher_name
         FROM departments d
         LEFT JOIN teachers t ON d.head_teacher_id = t.id
         WHERE d.id = $1 AND d.school_id = $2`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Department not found.' });
      }

      const row = result.rows[0];
      res.json({
        success: true,
        data: {
          id: row.id,
          schoolId: row.school_id,
          name: row.name,
          code: row.code,
          description: row.description,
          headTeacherId: row.head_teacher_id,
          headTeacherName: row.head_teacher_name,
          color: row.color,
          icon: row.icon,
          isActive: row.is_active,
          orderIndex: row.order_index
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting department:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve department.' });
  }
};

export const createDepartment = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { name, code, description, headTeacherId, color, icon, isActive, orderIndex } = req.body;

    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Name and code are required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `INSERT INTO departments (school_id, name, code, description, head_teacher_id, color, icon, is_active, order_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [schoolId, name, code.toUpperCase(), description, headTeacherId, color || '#4F46E5', icon || 'building', isActive !== false, orderIndex || 0]
      );

      res.status(201).json({
        success: true,
        message: 'Department created successfully.',
        data: result.rows[0]
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error creating department:', error);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Department code already exists.' });
    }
    res.status(500).json({ success: false, message: 'Failed to create department.' });
  }
};

export const updateDepartment = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { name, code, description, headTeacherId, color, icon, isActive, orderIndex } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `UPDATE departments
         SET name = COALESCE($1, name),
             code = COALESCE($2, code),
             description = COALESCE($3, description),
             head_teacher_id = $4,
             color = COALESCE($5, color),
             icon = COALESCE($6, icon),
             is_active = COALESCE($7, is_active),
             order_index = COALESCE($8, order_index),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $9 AND school_id = $10
         RETURNING *`,
        [name, code?.toUpperCase(), description, headTeacherId, color, icon, isActive, orderIndex, id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Department not found.' });
      }

      res.json({
        success: true,
        message: 'Department updated successfully.',
        data: result.rows[0]
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error updating department:', error);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Department code already exists.' });
    }
    res.status(500).json({ success: false, message: 'Failed to update department.' });
  }
};

export const deleteDepartment = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if department has subjects
      const checkResult = await dbClient.query(
        `SELECT COUNT(*) FROM subjects WHERE department_id = $1`,
        [id]
      );

      if (parseInt(checkResult.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete department with linked subjects. Remove subjects first or reassign them.'
        });
      }

      const result = await dbClient.query(
        `DELETE FROM departments WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Department not found.' });
      }

      res.json({ success: true, message: 'Department deleted successfully.' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({ success: false, message: 'Failed to delete department.' });
  }
};

export const bulkCreateDepartments = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { departments } = req.body;

    if (!Array.isArray(departments) || departments.length === 0) {
      return res.status(400).json({ success: false, message: 'Departments array is required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const created = [];
      const errors = [];

      for (const dept of departments) {
        if (!dept.name || !dept.code) {
          errors.push({ name: dept.name, error: 'Name and code are required' });
          continue;
        }

        try {
          const result = await dbClient.query(
            `INSERT INTO departments (school_id, name, code, description, color, is_active, order_index)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (school_id, code) DO UPDATE SET
               name = EXCLUDED.name,
               description = EXCLUDED.description,
               color = EXCLUDED.color,
               updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [schoolId, dept.name, dept.code.toUpperCase(), dept.description, dept.color || '#4F46E5', true, dept.orderIndex || 0]
          );
          created.push(result.rows[0]);
        } catch (err) {
          errors.push({ name: dept.name, error: err.message });
        }
      }

      res.json({
        success: true,
        message: `Created/updated ${created.length} departments.`,
        data: { created, errors }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error bulk creating departments:', error);
    res.status(500).json({ success: false, message: 'Failed to bulk create departments.' });
  }
};

export const reorderDepartments = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { orderedIds } = req.body;

    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ success: false, message: 'orderedIds array is required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      for (let i = 0; i < orderedIds.length; i++) {
        await dbClient.query(
          `UPDATE departments SET order_index = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2 AND school_id = $3`,
          [i, orderedIds[i], schoolId]
        );
      }

      res.json({ success: true, message: 'Departments reordered successfully.' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error reordering departments:', error);
    res.status(500).json({ success: false, message: 'Failed to reorder departments.' });
  }
};

