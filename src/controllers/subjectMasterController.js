import { getGroupDbClient } from '../lib/groupDb.js';

// =====================================================
// SUBJECT CATEGORIES CRUD
// =====================================================

export const getSubjectCategories = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { is_active } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT id, name, code, display_name, description, color, order_index, is_active, created_at, updated_at
        FROM subject_categories
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
    console.error('Error fetching subject categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subject categories',
      error: error.message
    });
  }
};

export const createSubjectCategory = async (req, res) => {
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
        `SELECT id FROM subject_categories WHERE school_id = $1 AND code = $2`,
        [schoolId, code]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'A category with this code already exists'
        });
      }

      const result = await dbClient.query(
        `INSERT INTO subject_categories (
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
        message: 'Subject category created successfully',
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
    console.error('Error creating subject category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subject category',
      error: error.message
    });
  }
};

export const updateSubjectCategory = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { name, code, displayName, description, color, orderIndex, isActive } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if category exists
      const existingResult = await dbClient.query(
        `SELECT id FROM subject_categories WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Subject category not found'
        });
      }

      // Check for duplicate code if code is being changed
      if (code) {
        const duplicateResult = await dbClient.query(
          `SELECT id FROM subject_categories WHERE school_id = $1 AND code = $2 AND id != $3`,
          [schoolId, code, id]
        );

        if (duplicateResult.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'A category with this code already exists'
          });
        }
      }

      const result = await dbClient.query(
        `UPDATE subject_categories SET
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
        message: 'Subject category updated successfully',
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
    console.error('Error updating subject category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update subject category',
      error: error.message
    });
  }
};

export const deleteSubjectCategory = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if category is used by any subjects
      const subjectsResult = await dbClient.query(
        `SELECT COUNT(*) as count FROM subjects WHERE category = (SELECT code FROM subject_categories WHERE id = $1 AND school_id = $2)`,
        [id, schoolId]
      );

      if (parseInt(subjectsResult.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete category. It is being used by one or more subjects.'
        });
      }

      const result = await dbClient.query(
        `DELETE FROM subject_categories WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Subject category not found'
        });
      }

      res.json({
        success: true,
        message: 'Subject category deleted successfully'
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error deleting subject category:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete subject category',
      error: error.message
    });
  }
};

// =====================================================
// SUBJECT TYPES CRUD
// =====================================================

export const getSubjectTypes = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { is_active } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT id, name, code, display_name, description, order_index, is_active, created_at, updated_at
        FROM subject_types
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
    console.error('Error fetching subject types:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch subject types',
      error: error.message
    });
  }
};

export const createSubjectType = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { name, code, displayName, description, orderIndex, isActive } = req.body;

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
        `SELECT id FROM subject_types WHERE school_id = $1 AND code = $2`,
        [schoolId, code]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'A type with this code already exists'
        });
      }

      const result = await dbClient.query(
        `INSERT INTO subject_types (
          name, code, display_name, description, order_index, is_active, school_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          name, code, displayName || name, description || null,
          orderIndex || 0, isActive !== false, schoolId
        ]
      );

      const row = result.rows[0];

      res.status(201).json({
        success: true,
        message: 'Subject type created successfully',
        data: {
          id: row.id,
          name: row.name,
          code: row.code,
          displayName: row.display_name,
          description: row.description,
          orderIndex: row.order_index,
          isActive: row.is_active
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error creating subject type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create subject type',
      error: error.message
    });
  }
};

export const updateSubjectType = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { name, code, displayName, description, orderIndex, isActive } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if type exists
      const existingResult = await dbClient.query(
        `SELECT id FROM subject_types WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Subject type not found'
        });
      }

      // Check for duplicate code if code is being changed
      if (code) {
        const duplicateResult = await dbClient.query(
          `SELECT id FROM subject_types WHERE school_id = $1 AND code = $2 AND id != $3`,
          [schoolId, code, id]
        );

        if (duplicateResult.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: 'A type with this code already exists'
          });
        }
      }

      const result = await dbClient.query(
        `UPDATE subject_types SET
          name = COALESCE($1, name),
          code = COALESCE($2, code),
          display_name = COALESCE($3, display_name),
          description = COALESCE($4, description),
          order_index = COALESCE($5, order_index),
          is_active = COALESCE($6, is_active),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $7 AND school_id = $8
        RETURNING *`,
        [name, code, displayName, description, orderIndex, isActive, id, schoolId]
      );

      const row = result.rows[0];

      res.json({
        success: true,
        message: 'Subject type updated successfully',
        data: {
          id: row.id,
          name: row.name,
          code: row.code,
          displayName: row.display_name,
          description: row.description,
          orderIndex: row.order_index,
          isActive: row.is_active
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error updating subject type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update subject type',
      error: error.message
    });
  }
};

export const deleteSubjectType = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if type is used by any subjects
      const subjectsResult = await dbClient.query(
        `SELECT COUNT(*) as count FROM subjects WHERE subject_type = (SELECT code FROM subject_types WHERE id = $1 AND school_id = $2)`,
        [id, schoolId]
      );

      if (parseInt(subjectsResult.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete type. It is being used by one or more subjects.'
        });
      }

      const result = await dbClient.query(
        `DELETE FROM subject_types WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Subject type not found'
        });
      }

      res.json({
        success: true,
        message: 'Subject type deleted successfully'
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error deleting subject type:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete subject type',
      error: error.message
    });
  }
};

