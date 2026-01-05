import { getGroupDbClient } from '../lib/groupDb.js';

// =====================================================
// STREAMS CRUD
// =====================================================

export const getStreams = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { is_active } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT id, name, code, display_name, description, color, order_index, is_active, created_at, updated_at
        FROM streams
        WHERE school_id = $1
      `;
      const params = [schoolId];

      if (is_active !== undefined) {
        query += ` AND is_active = $2`;
        params.push(is_active === 'true');
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
          color: row.color,
          orderIndex: row.order_index,
          isActive: row.is_active,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error fetching streams:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch streams',
      error: error.message
    });
  }
};

export const createStream = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { name, code, displayName, description, color, orderIndex, isActive } = req.body;

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
        `SELECT id FROM streams WHERE school_id = $1 AND code = $2`,
        [schoolId, code]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'A stream with this code already exists'
        });
      }

      const result = await dbClient.query(
        `INSERT INTO streams (
          name, code, display_name, description, color, order_index, is_active, school_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          name, code, displayName || name, description || null,
          color || '#6366F1', orderIndex || 0, isActive !== false, schoolId
        ]
      );

      const row = result.rows[0];

      res.status(201).json({
        success: true,
        message: 'Stream created successfully',
        data: {
          id: row.id,
          name: row.name,
          code: row.code,
          displayName: row.display_name,
          description: row.description,
          color: row.color,
          orderIndex: row.order_index,
          isActive: row.is_active
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error creating stream:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create stream',
      error: error.message
    });
  }
};

export const updateStream = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { name, code, displayName, description, color, orderIndex, isActive } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if stream exists
      const existingResult = await dbClient.query(
        `SELECT id FROM streams WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Stream not found'
        });
      }

      // Check for duplicate code if code is being changed
      if (code) {
        const duplicateResult = await dbClient.query(
          `SELECT id FROM streams WHERE school_id = $1 AND code = $2 AND id != $3`,
          [schoolId, code, id]
        );

        if (duplicateResult.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'A stream with this code already exists'
          });
        }
      }

      const result = await dbClient.query(
        `UPDATE streams SET
          name = COALESCE($1, name),
          code = COALESCE($2, code),
          display_name = COALESCE($3, display_name),
          description = COALESCE($4, description),
          color = COALESCE($5, color),
          order_index = COALESCE($6, order_index),
          is_active = COALESCE($7, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $8 AND school_id = $9
        RETURNING *`,
        [name, code, displayName, description, color, orderIndex, isActive, id, schoolId]
      );

      const row = result.rows[0];

      res.json({
        success: true,
        message: 'Stream updated successfully',
        data: {
          id: row.id,
          name: row.name,
          code: row.code,
          displayName: row.display_name,
          description: row.description,
          color: row.color,
          orderIndex: row.order_index,
          isActive: row.is_active
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error updating stream:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update stream',
      error: error.message
    });
  }
};

export const deleteStream = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if stream is used by any students
      const studentsResult = await dbClient.query(
        `SELECT COUNT(*) as count FROM students WHERE stream_id = $1`,
        [id]
      );

      if (parseInt(studentsResult.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete stream. It is being used by one or more students.'
        });
      }

      const result = await dbClient.query(
        `DELETE FROM streams WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Stream not found'
        });
      }

      res.json({
        success: true,
        message: 'Stream deleted successfully'
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error deleting stream:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete stream',
      error: error.message
    });
  }
};

