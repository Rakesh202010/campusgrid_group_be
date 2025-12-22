import prismaAdmin from '../lib/prisma.js';
import { getGroupDbClient } from '../lib/groupDb.js';

/**
 * Get all academic sessions for the school
 */
export const getAcademicSessions = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { status, page = 1, limit = 20 } = req.query;

    const group = await prismaAdmin.schoolGroup.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT 
          id, name, code, start_date, end_date, is_current, status,
          term_type, terms, description, settings, school_id,
          created_at, updated_at
        FROM academic_sessions
        WHERE school_id = $1
      `;
      const params = [schoolId];
      let paramIndex = 2;

      if (status) {
        query += ` AND status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      query += ` ORDER BY start_date DESC`;

      // Count query
      let countQuery = `SELECT COUNT(*) as count FROM academic_sessions WHERE school_id = $1`;
      if (status) {
        countQuery += ` AND status = $2`;
      }

      const offset = (page - 1) * limit;
      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(parseInt(limit), offset);

      const [sessions, countResult] = await Promise.all([
        dbClient.query(query, params),
        dbClient.query(countQuery, status ? [schoolId, status] : [schoolId])
      ]);

      const total = parseInt(countResult.rows[0].count);

      res.json({
        success: true,
        data: sessions.rows.map(session => ({
          id: session.id,
          name: session.name,
          code: session.code,
          startDate: session.start_date,
          endDate: session.end_date,
          isCurrent: session.is_current,
          status: session.status,
          termType: session.term_type,
          terms: session.terms,
          description: session.description,
          settings: session.settings,
          schoolId: session.school_id,
          createdAt: session.created_at,
          updatedAt: session.updated_at
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit)
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get academic sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch academic sessions',
      error: error.message
    });
  }
};

/**
 * Get a single academic session by ID
 */
export const getAcademicSessionById = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT * FROM academic_sessions WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Academic session not found'
        });
      }

      const session = result.rows[0];

      res.json({
        success: true,
        data: {
          id: session.id,
          name: session.name,
          code: session.code,
          startDate: session.start_date,
          endDate: session.end_date,
          isCurrent: session.is_current,
          status: session.status,
          termType: session.term_type,
          terms: session.terms,
          description: session.description,
          settings: session.settings,
          schoolId: session.school_id,
          createdAt: session.created_at,
          updatedAt: session.updated_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get academic session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch academic session',
      error: error.message
    });
  }
};

/**
 * Create a new academic session
 */
export const createAcademicSession = async (req, res) => {
  try {
    const { groupId, schoolId, adminId } = req.user;
    const {
      name,
      code,
      startDate,
      endDate,
      isCurrent = false,
      status = 'active',
      termType = 'annual',
      terms = [],
      description = '',
      settings = {}
    } = req.body;

    // Validation
    if (!name || !code || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Name, code, start date, and end date are required'
      });
    }

    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for duplicate code
      const existingResult = await dbClient.query(
        `SELECT id FROM academic_sessions WHERE code = $1 AND school_id = $2`,
        [code, schoolId]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Academic session with code "${code}" already exists`
        });
      }

      // Check for overlapping dates
      const overlapResult = await dbClient.query(
        `SELECT id, name FROM academic_sessions 
         WHERE school_id = $1 
         AND status != 'completed'
         AND (
           (start_date <= $2 AND end_date >= $2)
           OR (start_date <= $3 AND end_date >= $3)
           OR (start_date >= $2 AND end_date <= $3)
         )`,
        [schoolId, startDate, endDate]
      );

      if (overlapResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Dates overlap with existing session: ${overlapResult.rows[0].name}`
        });
      }

      // Insert academic session
      const result = await dbClient.query(
        `INSERT INTO academic_sessions (
          name, code, start_date, end_date, is_current, status,
          term_type, terms, description, settings, school_id, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          name, code, startDate, endDate, isCurrent, status,
          termType, JSON.stringify(terms), description, JSON.stringify(settings),
          schoolId, adminId
        ]
      );

      const session = result.rows[0];

      res.status(201).json({
        success: true,
        message: 'Academic session created successfully',
        data: {
          id: session.id,
          name: session.name,
          code: session.code,
          startDate: session.start_date,
          endDate: session.end_date,
          isCurrent: session.is_current,
          status: session.status,
          termType: session.term_type,
          terms: session.terms,
          description: session.description,
          settings: session.settings,
          schoolId: session.school_id,
          createdAt: session.created_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create academic session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create academic session',
      error: error.message
    });
  }
};

/**
 * Update an academic session
 */
export const updateAcademicSession = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if session exists
      const existingResult = await dbClient.query(
        `SELECT * FROM academic_sessions WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Academic session not found'
        });
      }

      const existing = existingResult.rows[0];

      // Build update query dynamically
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      const fieldMappings = {
        name: 'name',
        code: 'code',
        startDate: 'start_date',
        endDate: 'end_date',
        isCurrent: 'is_current',
        status: 'status',
        termType: 'term_type',
        terms: 'terms',
        description: 'description',
        settings: 'settings'
      };

      for (const [jsField, dbField] of Object.entries(fieldMappings)) {
        if (updates[jsField] !== undefined) {
          let value = updates[jsField];
          
          // Handle JSON fields
          if (['terms', 'settings'].includes(dbField)) {
            value = JSON.stringify(value);
          }
          
          updateFields.push(`${dbField} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }

      // Validate dates if both are being updated
      const newStartDate = updates.startDate || existing.start_date;
      const newEndDate = updates.endDate || existing.end_date;
      
      if (new Date(newEndDate) <= new Date(newStartDate)) {
        return res.status(400).json({
          success: false,
          message: 'End date must be after start date'
        });
      }

      // Check for code uniqueness if code is being updated
      if (updates.code && updates.code !== existing.code) {
        const codeCheckResult = await dbClient.query(
          `SELECT id FROM academic_sessions WHERE code = $1 AND school_id = $2 AND id != $3`,
          [updates.code, schoolId, id]
        );

        if (codeCheckResult.rows.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Academic session with code "${updates.code}" already exists`
          });
        }
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(id, schoolId);

      const updateQuery = `
        UPDATE academic_sessions 
        SET ${updateFields.join(', ')}
        WHERE id = $${paramIndex} AND school_id = $${paramIndex + 1}
        RETURNING *
      `;

      const result = await dbClient.query(updateQuery, values);
      const session = result.rows[0];

      res.json({
        success: true,
        message: 'Academic session updated successfully',
        data: {
          id: session.id,
          name: session.name,
          code: session.code,
          startDate: session.start_date,
          endDate: session.end_date,
          isCurrent: session.is_current,
          status: session.status,
          termType: session.term_type,
          terms: session.terms,
          description: session.description,
          settings: session.settings,
          schoolId: session.school_id,
          createdAt: session.created_at,
          updatedAt: session.updated_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update academic session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update academic session',
      error: error.message
    });
  }
};

/**
 * Delete an academic session
 */
export const deleteAcademicSession = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if session exists and is not current
      const existingResult = await dbClient.query(
        `SELECT id, name, is_current FROM academic_sessions WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Academic session not found'
        });
      }

      const session = existingResult.rows[0];

      if (session.is_current) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the current academic session. Please set another session as current first.'
        });
      }

      // Delete the session
      await dbClient.query(
        `DELETE FROM academic_sessions WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      res.json({
        success: true,
        message: `Academic session "${session.name}" deleted successfully`
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete academic session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete academic session',
      error: error.message
    });
  }
};

/**
 * Set an academic session as current
 */
export const setCurrentSession = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if session exists
      const existingResult = await dbClient.query(
        `SELECT id, name, status FROM academic_sessions WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (existingResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Academic session not found'
        });
      }

      const session = existingResult.rows[0];

      if (session.status === 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Cannot set a completed session as current'
        });
      }

      // The trigger will handle unsetting other current sessions
      await dbClient.query(
        `UPDATE academic_sessions SET is_current = true, updated_at = NOW() WHERE id = $1`,
        [id]
      );

      res.json({
        success: true,
        message: `"${session.name}" is now the current academic session`
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Set current session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set current session',
      error: error.message
    });
  }
};

/**
 * Get the current academic session
 */
export const getCurrentSession = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT * FROM academic_sessions WHERE school_id = $1 AND is_current = true`,
        [schoolId]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          data: null,
          message: 'No current academic session set'
        });
      }

      const session = result.rows[0];

      res.json({
        success: true,
        data: {
          id: session.id,
          name: session.name,
          code: session.code,
          startDate: session.start_date,
          endDate: session.end_date,
          isCurrent: session.is_current,
          status: session.status,
          termType: session.term_type,
          terms: session.terms,
          description: session.description,
          settings: session.settings,
          schoolId: session.school_id,
          createdAt: session.created_at,
          updatedAt: session.updated_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get current session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch current session',
      error: error.message
    });
  }
};

