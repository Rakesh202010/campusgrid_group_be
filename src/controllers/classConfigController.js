import prismaAdmin from '../lib/prisma.js';
import { getGroupDbClient } from '../lib/groupDb.js';

// =====================================================
// CLASS GRADES (Classes like Class 1, Class 2, etc.)
// =====================================================

/**
 * Get all class grades for the school
 */
export const getClassGrades = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, is_active } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT 
          cg.id, cg.name, cg.display_name, cg.numeric_value, cg.description,
          cg.order_index, cg.is_active, cg.academic_session_id, cg.school_id,
          cg.created_at, cg.updated_at,
          acs.name as session_name, acs.code as session_code
        FROM class_grades cg
        LEFT JOIN academic_sessions acs ON cg.academic_session_id = acs.id
        WHERE cg.school_id = $1
      `;
      const params = [schoolId];
      let paramIndex = 2;

      if (academic_session_id) {
        query += ` AND cg.academic_session_id = $${paramIndex}`;
        params.push(academic_session_id);
        paramIndex++;
      }

      if (is_active !== undefined) {
        query += ` AND cg.is_active = $${paramIndex}`;
        params.push(is_active === 'true');
        paramIndex++;
      }

      query += ` ORDER BY cg.order_index ASC, cg.numeric_value ASC`;

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          displayName: row.display_name,
          numericValue: row.numeric_value,
          description: row.description,
          orderIndex: row.order_index,
          isActive: row.is_active,
          academicSessionId: row.academic_session_id,
          sessionName: row.session_name,
          sessionCode: row.session_code,
          schoolId: row.school_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get class grades error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch class grades',
      error: error.message
    });
  }
};

/**
 * Create a new class grade
 */
export const createClassGrade = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const {
      name,
      displayName,
      numericValue,
      description,
      orderIndex = 0,
      isActive = true,
      academicSessionId
    } = req.body;

    if (!name || !displayName) {
      return res.status(400).json({
        success: false,
        message: 'Name and display name are required'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for duplicate
      const existingResult = await dbClient.query(
        `SELECT id FROM class_grades WHERE school_id = $1 AND name = $2 AND academic_session_id = $3`,
        [schoolId, name, academicSessionId || null]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Class grade "${name}" already exists`
        });
      }

      const result = await dbClient.query(
        `INSERT INTO class_grades (
          name, display_name, numeric_value, description, order_index, 
          is_active, academic_session_id, school_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [name, displayName, numericValue, description, orderIndex, isActive, academicSessionId, schoolId]
      );

      const row = result.rows[0];

      res.status(201).json({
        success: true,
        message: 'Class grade created successfully',
        data: {
          id: row.id,
          name: row.name,
          displayName: row.display_name,
          numericValue: row.numeric_value,
          description: row.description,
          orderIndex: row.order_index,
          isActive: row.is_active,
          academicSessionId: row.academic_session_id,
          schoolId: row.school_id,
          createdAt: row.created_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create class grade error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create class grade',
      error: error.message
    });
  }
};

/**
 * Update a class grade
 */
export const updateClassGrade = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Build update query
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      const fieldMappings = {
        name: 'name',
        displayName: 'display_name',
        numericValue: 'numeric_value',
        description: 'description',
        orderIndex: 'order_index',
        isActive: 'is_active',
        academicSessionId: 'academic_session_id'
      };

      for (const [jsField, dbField] of Object.entries(fieldMappings)) {
        if (updates[jsField] !== undefined) {
          updateFields.push(`${dbField} = $${paramIndex}`);
          values.push(updates[jsField]);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(id, schoolId);

      const result = await dbClient.query(
        `UPDATE class_grades 
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex} AND school_id = $${paramIndex + 1}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Class grade not found'
        });
      }

      const row = result.rows[0];

      res.json({
        success: true,
        message: 'Class grade updated successfully',
        data: {
          id: row.id,
          name: row.name,
          displayName: row.display_name,
          numericValue: row.numeric_value,
          description: row.description,
          orderIndex: row.order_index,
          isActive: row.is_active,
          academicSessionId: row.academic_session_id,
          schoolId: row.school_id,
          updatedAt: row.updated_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update class grade error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update class grade',
      error: error.message
    });
  }
};

/**
 * Delete a class grade
 */
export const deleteClassGrade = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if in use
      const usageCheck = await dbClient.query(
        `SELECT COUNT(*) as count FROM class_sections WHERE class_grade_id = $1`,
        [id]
      );

      if (parseInt(usageCheck.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete class grade that has sections assigned. Remove sections first.'
        });
      }

      const result = await dbClient.query(
        `DELETE FROM class_grades WHERE id = $1 AND school_id = $2 RETURNING name`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Class grade not found'
        });
      }

      res.json({
        success: true,
        message: `Class grade "${result.rows[0].name}" deleted successfully`
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete class grade error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete class grade',
      error: error.message
    });
  }
};

// =====================================================
// SECTIONS (A, B, C, etc.)
// =====================================================

/**
 * Get all sections for the school
 */
export const getSections = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { is_active } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT id, name, display_name, description, order_index, is_active, 
               school_id, created_at, updated_at
        FROM sections
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
          displayName: row.display_name,
          description: row.description,
          orderIndex: row.order_index,
          isActive: row.is_active,
          schoolId: row.school_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get sections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch sections',
      error: error.message
    });
  }
};

/**
 * Create a new section
 */
export const createSection = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const {
      name,
      displayName,
      description,
      orderIndex = 0,
      isActive = true
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Section name is required'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for duplicate
      const existingResult = await dbClient.query(
        `SELECT id FROM sections WHERE school_id = $1 AND name = $2`,
        [schoolId, name]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Section "${name}" already exists`
        });
      }

      const result = await dbClient.query(
        `INSERT INTO sections (name, display_name, description, order_index, is_active, school_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [name, displayName || name, description, orderIndex, isActive, schoolId]
      );

      const row = result.rows[0];

      res.status(201).json({
        success: true,
        message: 'Section created successfully',
        data: {
          id: row.id,
          name: row.name,
          displayName: row.display_name,
          description: row.description,
          orderIndex: row.order_index,
          isActive: row.is_active,
          schoolId: row.school_id,
          createdAt: row.created_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create section error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create section',
      error: error.message
    });
  }
};

/**
 * Update a section
 */
export const updateSection = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      const fieldMappings = {
        name: 'name',
        displayName: 'display_name',
        description: 'description',
        orderIndex: 'order_index',
        isActive: 'is_active'
      };

      for (const [jsField, dbField] of Object.entries(fieldMappings)) {
        if (updates[jsField] !== undefined) {
          updateFields.push(`${dbField} = $${paramIndex}`);
          values.push(updates[jsField]);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(id, schoolId);

      const result = await dbClient.query(
        `UPDATE sections 
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex} AND school_id = $${paramIndex + 1}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Section not found'
        });
      }

      const row = result.rows[0];

      res.json({
        success: true,
        message: 'Section updated successfully',
        data: {
          id: row.id,
          name: row.name,
          displayName: row.display_name,
          description: row.description,
          orderIndex: row.order_index,
          isActive: row.is_active,
          schoolId: row.school_id,
          updatedAt: row.updated_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update section error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update section',
      error: error.message
    });
  }
};

/**
 * Delete a section
 */
export const deleteSection = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check if in use
      const usageCheck = await dbClient.query(
        `SELECT COUNT(*) as count FROM class_sections WHERE section_id = $1`,
        [id]
      );

      if (parseInt(usageCheck.rows[0].count) > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete section that is assigned to classes. Remove assignments first.'
        });
      }

      const result = await dbClient.query(
        `DELETE FROM sections WHERE id = $1 AND school_id = $2 RETURNING name`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Section not found'
        });
      }

      res.json({
        success: true,
        message: `Section "${result.rows[0].name}" deleted successfully`
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete section error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete section',
      error: error.message
    });
  }
};

// =====================================================
// CLASS SECTIONS (Grade + Section combinations)
// =====================================================

/**
 * Get all class sections (Grade-Section mappings)
 */
export const getClassSections = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { class_grade_id, section_id, academic_session_id, is_active } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT 
          cs.id, cs.capacity, cs.current_strength, cs.room_number, cs.building, 
          cs.floor, cs.is_active, cs.academic_session_id, cs.school_id,
          cs.class_grade_id, cs.section_id, cs.class_teacher_id,
          cs.created_at, cs.updated_at,
          cg.name as grade_name, cg.display_name as grade_display_name, cg.numeric_value,
          s.name as section_name, s.display_name as section_display_name,
          acs.name as session_name, acs.code as session_code
        FROM class_sections cs
        INNER JOIN class_grades cg ON cs.class_grade_id = cg.id
        INNER JOIN sections s ON cs.section_id = s.id
        LEFT JOIN academic_sessions acs ON cs.academic_session_id = acs.id
        WHERE cs.school_id = $1
      `;
      const params = [schoolId];
      let paramIndex = 2;

      if (class_grade_id) {
        query += ` AND cs.class_grade_id = $${paramIndex}`;
        params.push(class_grade_id);
        paramIndex++;
      }

      if (section_id) {
        query += ` AND cs.section_id = $${paramIndex}`;
        params.push(section_id);
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

      query += ` ORDER BY cg.order_index ASC, cg.numeric_value ASC, s.order_index ASC`;

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          classGradeId: row.class_grade_id,
          sectionId: row.section_id,
          gradeName: row.grade_name,
          gradeDisplayName: row.grade_display_name,
          numericValue: row.numeric_value,
          sectionName: row.section_name,
          sectionDisplayName: row.section_display_name,
          displayName: `${row.grade_display_name} - ${row.section_display_name || row.section_name}`,
          capacity: row.capacity,
          currentStrength: row.current_strength,
          roomNumber: row.room_number,
          building: row.building,
          floor: row.floor,
          classTeacherId: row.class_teacher_id,
          teacherName: null,
          teacherEmail: null,
          academicSessionId: row.academic_session_id,
          sessionName: row.session_name,
          sessionCode: row.session_code,
          isActive: row.is_active,
          schoolId: row.school_id,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get class sections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch class sections',
      error: error.message
    });
  }
};

/**
 * Create a new class section
 */
export const createClassSection = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const {
      classGradeId,
      sectionId,
      capacity = 40,
      roomNumber,
      building,
      floor,
      classTeacherId,
      academicSessionId,
      isActive = true
    } = req.body;

    if (!classGradeId || !sectionId) {
      return res.status(400).json({
        success: false,
        message: 'Class grade and section are required'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for duplicate
      const existingResult = await dbClient.query(
        `SELECT id FROM class_sections 
         WHERE class_grade_id = $1 AND section_id = $2 AND academic_session_id = $3`,
        [classGradeId, sectionId, academicSessionId || null]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'This class-section combination already exists'
        });
      }

      const result = await dbClient.query(
        `INSERT INTO class_sections (
          class_grade_id, section_id, capacity, room_number, building, floor,
          class_teacher_id, academic_session_id, is_active, school_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [classGradeId, sectionId, capacity, roomNumber, building, floor,
         classTeacherId, academicSessionId, isActive, schoolId]
      );

      // Fetch full details
      const fullResult = await dbClient.query(
        `SELECT 
          cs.*, 
          cg.name as grade_name, cg.display_name as grade_display_name,
          s.name as section_name, s.display_name as section_display_name
         FROM class_sections cs
         INNER JOIN class_grades cg ON cs.class_grade_id = cg.id
         INNER JOIN sections s ON cs.section_id = s.id
         WHERE cs.id = $1`,
        [result.rows[0].id]
      );

      const row = fullResult.rows[0];

      res.status(201).json({
        success: true,
        message: 'Class section created successfully',
        data: {
          id: row.id,
          classGradeId: row.class_grade_id,
          sectionId: row.section_id,
          gradeName: row.grade_name,
          gradeDisplayName: row.grade_display_name,
          sectionName: row.section_name,
          sectionDisplayName: row.section_display_name,
          displayName: `${row.grade_display_name} - ${row.section_display_name || row.section_name}`,
          capacity: row.capacity,
          roomNumber: row.room_number,
          building: row.building,
          floor: row.floor,
          classTeacherId: row.class_teacher_id,
          teacherName: null,
          isActive: row.is_active,
          createdAt: row.created_at
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create class section error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create class section',
      error: error.message
    });
  }
};

/**
 * Update a class section
 */
export const updateClassSection = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      const fieldMappings = {
        capacity: 'capacity',
        currentStrength: 'current_strength',
        roomNumber: 'room_number',
        building: 'building',
        floor: 'floor',
        classTeacherId: 'class_teacher_id',
        isActive: 'is_active'
      };

      for (const [jsField, dbField] of Object.entries(fieldMappings)) {
        if (updates[jsField] !== undefined) {
          updateFields.push(`${dbField} = $${paramIndex}`);
          values.push(updates[jsField]);
          paramIndex++;
        }
      }

      if (updateFields.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid fields to update'
        });
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(id, schoolId);

      const result = await dbClient.query(
        `UPDATE class_sections 
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex} AND school_id = $${paramIndex + 1}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Class section not found'
        });
      }

      res.json({
        success: true,
        message: 'Class section updated successfully',
        data: result.rows[0]
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update class section error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update class section',
      error: error.message
    });
  }
};

/**
 * Delete a class section
 */
export const deleteClassSection = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM class_sections WHERE id = $1 AND school_id = $2
         RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Class section not found'
        });
      }

      res.json({
        success: true,
        message: 'Class section deleted successfully'
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete class section error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete class section',
      error: error.message
    });
  }
};

/**
 * Bulk create class sections for a grade
 */
export const bulkCreateClassSections = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { classGradeId, sectionIds, academicSessionId, defaultCapacity = 40 } = req.body;

    if (!classGradeId || !sectionIds || !Array.isArray(sectionIds) || sectionIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Class grade and section IDs are required'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const created = [];
      const skipped = [];

      for (const sectionId of sectionIds) {
        // Check if already exists
        const existingResult = await dbClient.query(
          `SELECT id FROM class_sections 
           WHERE class_grade_id = $1 AND section_id = $2 AND academic_session_id = $3`,
          [classGradeId, sectionId, academicSessionId || null]
        );

        if (existingResult.rows.length > 0) {
          skipped.push(sectionId);
          continue;
        }

        const result = await dbClient.query(
          `INSERT INTO class_sections (
            class_grade_id, section_id, capacity, academic_session_id, school_id
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING id`,
          [classGradeId, sectionId, defaultCapacity, academicSessionId, schoolId]
        );

        created.push(result.rows[0].id);
      }

      res.status(201).json({
        success: true,
        message: `Created ${created.length} class sections, skipped ${skipped.length} (already exist)`,
        data: {
          created: created.length,
          skipped: skipped.length
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Bulk create class sections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create class sections',
      error: error.message
    });
  }
};

/**
 * Copy class sections from one academic session to another
 */
export const copyClassSections = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { sourceSessionId, targetSessionId } = req.body;

    if (!sourceSessionId || !targetSessionId) {
      return res.status(400).json({
        success: false,
        message: 'Source and target session IDs are required'
      });
    }

    if (sourceSessionId === targetSessionId) {
      return res.status(400).json({
        success: false,
        message: 'Source and target sessions cannot be the same'
      });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get all class sections from source session
      const sourceResult = await dbClient.query(
        `SELECT class_grade_id, section_id, capacity, room_number, building, floor
         FROM class_sections
         WHERE academic_session_id = $1 AND school_id = $2`,
        [sourceSessionId, schoolId]
      );

      if (sourceResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No class sections found in source session'
        });
      }

      let created = 0;
      let skipped = 0;

      for (const row of sourceResult.rows) {
        // Check if already exists in target session
        const existingResult = await dbClient.query(
          `SELECT id FROM class_sections 
           WHERE class_grade_id = $1 AND section_id = $2 AND academic_session_id = $3`,
          [row.class_grade_id, row.section_id, targetSessionId]
        );

        if (existingResult.rows.length > 0) {
          skipped++;
          continue;
        }

        // Create in target session (copy structure but reset current_strength to 0)
        await dbClient.query(
          `INSERT INTO class_sections (
            class_grade_id, section_id, capacity, room_number, building, floor,
            current_strength, academic_session_id, is_active, school_id
          ) VALUES ($1, $2, $3, $4, $5, $6, 0, $7, true, $8)`,
          [row.class_grade_id, row.section_id, row.capacity, row.room_number, 
           row.building, row.floor, targetSessionId, schoolId]
        );

        created++;
      }

      res.status(201).json({
        success: true,
        message: `Copied ${created} class sections, skipped ${skipped} (already exist in target session)`,
        data: {
          created,
          skipped,
          total: sourceResult.rows.length
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Copy class sections error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to copy class sections',
      error: error.message
    });
  }
};

