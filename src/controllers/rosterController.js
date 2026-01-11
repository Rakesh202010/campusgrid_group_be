/**
 * Roster & Duties Controller
 * 
 * Handles all roster-related operations:
 * - Master CRUD (duties, time slots, locations, roles, roster types)
 * - Roster assignment engine with validation
 * - Conflict detection
 * - Approval workflow
 * - Reporting
 */

import { getGroupDbClient } from '../lib/groupDb.js';

// Helper to get db client and schoolId from request
const getDbAndSchool = async (req) => {
  const { groupId, schoolId } = req.user;
  const dbClient = await getGroupDbClient(groupId);
  return { dbClient, schoolId };
};

// ============================================
// ROSTER TYPE MASTER
// ============================================

export const getRosterTypes = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { active_only } = req.query;
    
    let query = `SELECT * FROM roster_types WHERE school_id = $1`;
    if (active_only === 'true') {
      query += ` AND is_active = true`;
    }
    query += ` ORDER BY name`;
    
    const result = await dbClient.query(query, [schoolId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching roster types:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const createRosterType = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { code, name, description, color, icon } = req.body;
    
    const result = await dbClient.query(`
      INSERT INTO roster_types (school_id, code, name, description, color, icon)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [schoolId, code, name, description, color, icon]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating roster type:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const updateRosterType = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const { name, description, color, icon, is_active } = req.body;
    
    const result = await dbClient.query(`
      UPDATE roster_types 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          color = COALESCE($3, color),
          icon = COALESCE($4, icon),
          is_active = COALESCE($5, is_active),
          updated_at = NOW()
      WHERE id = $6 AND is_system = false
      RETURNING *
    `, [name, description, color, icon, is_active, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Roster type not found or is system type' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating roster type:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// ============================================
// DUTY CATEGORIES
// ============================================

export const getDutyCategories = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { active_only } = req.query;
    
    let query = `SELECT * FROM duty_categories WHERE school_id = $1`;
    if (active_only === 'true') {
      query += ` AND is_active = true`;
    }
    query += ` ORDER BY display_order, name`;
    
    const result = await dbClient.query(query, [schoolId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching duty categories:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const createDutyCategory = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { code, name, description, color, icon, display_order } = req.body;
    
    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Code and name are required' });
    }
    
    const result = await dbClient.query(`
      INSERT INTO duty_categories (school_id, code, name, description, color, icon, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [schoolId, code.toUpperCase(), name, description, color || '#6B7280', icon, display_order || 0]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating duty category:', error);
    if (error.code === '23505') {
      res.status(400).json({ success: false, message: 'Category code already exists' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const updateDutyCategory = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const { name, description, color, icon, display_order, is_active } = req.body;
    
    const result = await dbClient.query(`
      UPDATE duty_categories 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          color = COALESCE($3, color),
          icon = COALESCE($4, icon),
          display_order = COALESCE($5, display_order),
          is_active = COALESCE($6, is_active),
          updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [name, description, color, icon, display_order, is_active, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating duty category:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const deleteDutyCategory = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    
    // Check if category is in use
    const usageCheck = await dbClient.query(
      'SELECT COUNT(*) FROM duty_master WHERE category_id = $1', [id]
    );
    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete category that is assigned to duties' 
      });
    }
    
    const result = await dbClient.query(
      'DELETE FROM duty_categories WHERE id = $1 RETURNING id', [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Category not found' });
    }
    
    res.json({ success: true, message: 'Category deleted' });
  } catch (error) {
    console.error('Error deleting duty category:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// ============================================
// TIME SLOT MASTER
// ============================================

export const getTimeSlots = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { active_only } = req.query;
    
    let query = `SELECT * FROM duty_time_slots WHERE school_id = $1`;
    if (active_only === 'true') {
      query += ` AND is_active = true`;
    }
    query += ` ORDER BY display_order, start_time`;
    
    const result = await dbClient.query(query, [schoolId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching time slots:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const createTimeSlot = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { code, name, start_time, end_time, applies_to_days, display_order } = req.body;
    
    const result = await dbClient.query(`
      INSERT INTO duty_time_slots (school_id, code, name, start_time, end_time, applies_to_days, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [schoolId, code, name, start_time, end_time, applies_to_days || ['mon','tue','wed','thu','fri','sat'], display_order || 0]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating time slot:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const updateTimeSlot = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const { name, start_time, end_time, applies_to_days, display_order, is_active } = req.body;
    
    const result = await dbClient.query(`
      UPDATE duty_time_slots 
      SET name = COALESCE($1, name),
          start_time = COALESCE($2, start_time),
          end_time = COALESCE($3, end_time),
          applies_to_days = COALESCE($4, applies_to_days),
          display_order = COALESCE($5, display_order),
          is_active = COALESCE($6, is_active),
          updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [name, start_time, end_time, applies_to_days, display_order, is_active, id]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating time slot:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const deleteTimeSlot = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    
    // Check if in use
    const usageCheck = await dbClient.query(
      'SELECT COUNT(*) FROM roster_assignments WHERE time_slot_id = $1', [id]
    );
    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ success: false, message: 'Time slot is in use and cannot be deleted' });
    }
    
    await dbClient.query('DELETE FROM duty_time_slots WHERE id = $1', [id]);
    res.json({ success: true, message: 'Time slot deleted' });
  } catch (error) {
    console.error('Error deleting time slot:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// ============================================
// LOCATION MASTER
// ============================================

export const getLocations = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { active_only, type } = req.query;
    
    let query = `SELECT * FROM duty_locations WHERE school_id = $1`;
    const params = [schoolId];
    
    if (active_only === 'true') {
      query += ` AND is_active = true`;
    }
    if (type) {
      params.push(type);
      query += ` AND type = $${params.length}`;
    }
    query += ` ORDER BY name`;
    
    const result = await dbClient.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const createLocation = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { code, name, type, building, floor, capacity, description } = req.body;
    
    const result = await dbClient.query(`
      INSERT INTO duty_locations (school_id, code, name, type, building, floor, capacity, description)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [schoolId, code, name, type || 'other', building, floor, capacity, description]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating location:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const updateLocation = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const { name, type, building, floor, capacity, description, is_active } = req.body;
    
    const result = await dbClient.query(`
      UPDATE duty_locations 
      SET name = COALESCE($1, name),
          type = COALESCE($2, type),
          building = COALESCE($3, building),
          floor = COALESCE($4, floor),
          capacity = COALESCE($5, capacity),
          description = COALESCE($6, description),
          is_active = COALESCE($7, is_active),
          updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [name, type, building, floor, capacity, description, is_active, id]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating location:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const deleteLocation = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    
    const usageCheck = await dbClient.query(
      'SELECT COUNT(*) FROM roster_assignments WHERE location_id = $1', [id]
    );
    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ success: false, message: 'Location is in use and cannot be deleted' });
    }
    
    await dbClient.query('DELETE FROM duty_locations WHERE id = $1', [id]);
    res.json({ success: true, message: 'Location deleted' });
  } catch (error) {
    console.error('Error deleting location:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// ============================================
// DUTY ROLE MASTER
// ============================================

export const getDutyRoles = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { active_only } = req.query;
    
    let query = `SELECT * FROM duty_roles WHERE school_id = $1`;
    if (active_only === 'true') {
      query += ` AND is_active = true`;
    }
    query += ` ORDER BY priority, name`;
    
    const result = await dbClient.query(query, [schoolId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching duty roles:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const createDutyRole = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { code, name, description, priority } = req.body;
    
    const result = await dbClient.query(`
      INSERT INTO duty_roles (school_id, code, name, description, priority)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [schoolId, code, name, description, priority || 0]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating duty role:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const updateDutyRole = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const { name, description, priority, is_active } = req.body;
    
    const result = await dbClient.query(`
      UPDATE duty_roles 
      SET name = COALESCE($1, name),
          description = COALESCE($2, description),
          priority = COALESCE($3, priority),
          is_active = COALESCE($4, is_active),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [name, description, priority, is_active, id]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating duty role:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const deleteDutyRole = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    
    const usageCheck = await dbClient.query(
      'SELECT COUNT(*) FROM roster_assignments WHERE role_id = $1', [id]
    );
    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ success: false, message: 'Role is in use and cannot be deleted' });
    }
    
    await dbClient.query('DELETE FROM duty_roles WHERE id = $1', [id]);
    res.json({ success: true, message: 'Duty role deleted' });
  } catch (error) {
    console.error('Error deleting duty role:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// ============================================
// DUTY MASTER
// ============================================

export const getDuties = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { active_only, category_id, roster_type_id } = req.query;
    
    let query = `
      SELECT dm.*, 
             rt.name as roster_type_name, rt.color as roster_type_color,
             ts.name as default_time_slot_name,
             dl.name as default_location_name,
             dc.name as category_name, dc.code as category_code, dc.color as category_color
      FROM duty_master dm
      LEFT JOIN roster_types rt ON dm.roster_type_id = rt.id
      LEFT JOIN duty_time_slots ts ON dm.default_time_slot_id = ts.id
      LEFT JOIN duty_locations dl ON dm.default_location_id = dl.id
      LEFT JOIN duty_categories dc ON dm.category_id = dc.id
      WHERE dm.school_id = $1
    `;
    const params = [schoolId];
    
    if (active_only === 'true') {
      query += ` AND dm.is_active = true`;
    }
    if (category_id) {
      params.push(category_id);
      query += ` AND dm.category_id = $${params.length}`;
    }
    if (roster_type_id) {
      params.push(roster_type_id);
      query += ` AND dm.roster_type_id = $${params.length}`;
    }
    query += ` ORDER BY dm.name`;
    
    const result = await dbClient.query(query, params);
    // Ensure allowed_assignee_types is always a proper array
    const data = result.rows.map(row => {
      let assigneeTypes = row.allowed_assignee_types;
      console.log(`[DEBUG] Duty ${row.name}: raw allowed_assignee_types =`, assigneeTypes, 'isArray:', Array.isArray(assigneeTypes));
      
      // PostgreSQL arrays come back as JS arrays, but ensure it's valid
      if (!assigneeTypes) {
        assigneeTypes = ['teacher', 'staff'];
      } else if (!Array.isArray(assigneeTypes)) {
        // If somehow not an array, try to parse
        if (typeof assigneeTypes === 'string') {
          if (assigneeTypes.startsWith('{') && assigneeTypes.endsWith('}')) {
            assigneeTypes = assigneeTypes.slice(1, -1).split(',').filter(s => s.trim());
          } else {
            assigneeTypes = [assigneeTypes];
          }
        } else {
          assigneeTypes = ['teacher', 'staff'];
        }
      }
      
      console.log(`[DEBUG] Duty ${row.name}: processed allowed_assignee_types =`, assigneeTypes);
      
      return {
        ...row,
        allowed_assignee_types: assigneeTypes
      };
    });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching duties:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const getDutyById = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    
    const result = await dbClient.query(`
      SELECT dm.*, 
             rt.name as roster_type_name,
             ts.name as default_time_slot_name,
             dl.name as default_location_name
      FROM duty_master dm
      LEFT JOIN roster_types rt ON dm.roster_type_id = rt.id
      LEFT JOIN duty_time_slots ts ON dm.default_time_slot_id = ts.id
      LEFT JOIN duty_locations dl ON dm.default_location_id = dl.id
      WHERE dm.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Duty not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching duty:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const createDuty = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const {
      code, name, category_id, roster_type_id, allowed_assignee_types,
      risk_level, supervisor_required, default_time_slot_id, default_location_id,
      min_assignees, max_assignees, max_per_week_student, instructions
    } = req.body;
    
    if (!code || !name) {
      return res.status(400).json({ success: false, message: 'Code and name are required' });
    }
    
    const result = await dbClient.query(`
      INSERT INTO duty_master (
        school_id, code, name, category_id, roster_type_id, allowed_assignee_types,
        risk_level, supervisor_required, default_time_slot_id, default_location_id,
        min_assignees, max_assignees, max_per_week_student, instructions
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      schoolId, code.toUpperCase(), name, category_id || null, roster_type_id || null, 
      allowed_assignee_types || ['teacher', 'staff'],
      risk_level || 'low', supervisor_required || false, 
      default_time_slot_id || null, default_location_id || null,
      min_assignees || 1, max_assignees || null, max_per_week_student || 2, instructions
    ]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating duty:', error);
    if (error.code === '23505') {
      res.status(400).json({ success: false, message: 'Duty code already exists' });
    } else {
      res.status(500).json({ success: false, message: error.message });
    }
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const updateDuty = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const {
      name, category_id, roster_type_id, allowed_assignee_types,
      risk_level, supervisor_required, default_time_slot_id, default_location_id,
      min_assignees, max_assignees, max_per_week_student, instructions, is_active
    } = req.body;
    
    // Helper to convert empty strings to null for UUID fields
    const toUuidOrNull = (val) => (val && String(val).trim() !== '') ? val : null;
    
    // Ensure allowed_assignee_types is a proper array with at least one value
    let processedAssigneeTypes = allowed_assignee_types;
    if (!processedAssigneeTypes || !Array.isArray(processedAssigneeTypes) || processedAssigneeTypes.length === 0) {
      processedAssigneeTypes = ['teacher', 'staff']; // Default if empty
    }
    
    console.log('[DEBUG] Updating duty with allowed_assignee_types:', processedAssigneeTypes);
    
    const result = await dbClient.query(`
      UPDATE duty_master SET
        name = COALESCE($1, name),
        category_id = $2,
        roster_type_id = $3,
        allowed_assignee_types = $4,
        risk_level = COALESCE($5, risk_level),
        supervisor_required = COALESCE($6, supervisor_required),
        default_time_slot_id = $7,
        default_location_id = $8,
        min_assignees = COALESCE($9, min_assignees),
        max_assignees = $10,
        max_per_week_student = COALESCE($11, max_per_week_student),
        instructions = COALESCE($12, instructions),
        is_active = COALESCE($13, is_active),
        updated_at = NOW()
      WHERE id = $14
      RETURNING *
    `, [
      name, 
      toUuidOrNull(category_id), 
      toUuidOrNull(roster_type_id), 
      processedAssigneeTypes,
      risk_level, 
      supervisor_required, 
      toUuidOrNull(default_time_slot_id), 
      toUuidOrNull(default_location_id),
      min_assignees, 
      max_assignees, 
      max_per_week_student, 
      instructions, 
      is_active, 
      id
    ]);
    
    console.log('[DEBUG] Updated duty result:', result.rows[0]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating duty:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const deleteDuty = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    
    const usageCheck = await dbClient.query(
      'SELECT COUNT(*) FROM roster_assignments WHERE duty_id = $1', [id]
    );
    if (parseInt(usageCheck.rows[0].count) > 0) {
      return res.status(400).json({ success: false, message: 'Duty is in use and cannot be deleted' });
    }
    
    await dbClient.query('DELETE FROM duty_master WHERE id = $1', [id]);
    res.json({ success: true, message: 'Duty deleted' });
  } catch (error) {
    console.error('Error deleting duty:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// ============================================
// ROSTER ASSIGNMENTS
// ============================================

export const getRosterAssignments = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    console.log('[ROSTER] Fetching assignments - Query params:', req.query);
    
    dbClient = await getGroupDbClient(groupId);
    const { 
      academic_session_id, roster_type_id, duty_id, assignee_type, 
      assignee_id, status, start_date, end_date, supervisor_id 
    } = req.query;
    
    let query = `
      SELECT ra.*,
             rt.name as roster_type_name, rt.color as roster_type_color,
             dm.name as duty_name, dm.category as duty_category,
             ts.name as time_slot_name, ts.start_time, ts.end_time,
             dl.name as location_name,
             dr.name as role_name,
             CASE 
               WHEN ra.assignee_type = 'teacher' THEN COALESCE(t.first_name || ' ' || t.last_name, 'Unknown Teacher')
               WHEN ra.assignee_type = 'staff' THEN COALESCE(sm.first_name || ' ' || sm.last_name, 'Unknown Staff')
               WHEN ra.assignee_type = 'student' THEN COALESCE(s.first_name || ' ' || s.last_name, 'Unknown Student')
               ELSE 'Unassigned'
             END as assignee_name,
             CASE 
               WHEN ra.supervisor_id IS NOT NULL THEN COALESCE(sup_t.first_name || ' ' || sup_t.last_name, sup_sm.first_name || ' ' || sup_sm.last_name)
               ELSE NULL
             END as supervisor_name
      FROM roster_assignments ra
      LEFT JOIN roster_types rt ON ra.roster_type_id = rt.id
      LEFT JOIN duty_master dm ON ra.duty_id = dm.id
      LEFT JOIN duty_time_slots ts ON ra.time_slot_id = ts.id
      LEFT JOIN duty_locations dl ON ra.location_id = dl.id
      LEFT JOIN duty_roles dr ON ra.role_id = dr.id
      LEFT JOIN teachers t ON ra.assignee_type = 'teacher' AND ra.assignee_id = t.id
      LEFT JOIN staff_members sm ON ra.assignee_type = 'staff' AND ra.assignee_id = sm.id
      LEFT JOIN students s ON ra.assignee_type = 'student' AND ra.assignee_id = s.id
      LEFT JOIN teachers sup_t ON ra.supervisor_id = sup_t.id
      LEFT JOIN staff_members sup_sm ON ra.supervisor_id = sup_sm.id AND sup_t.id IS NULL
      WHERE ra.school_id = $1
    `;
    
    const params = [schoolId];
    
    // Only filter by academic_session_id if provided AND not empty
    if (academic_session_id && academic_session_id !== 'undefined' && academic_session_id !== '') {
      params.push(academic_session_id);
      query += ` AND (ra.academic_session_id = $${params.length} OR ra.academic_session_id IS NULL)`;
    }
    if (roster_type_id) {
      params.push(roster_type_id);
      query += ` AND ra.roster_type_id = $${params.length}`;
    }
    if (duty_id) {
      params.push(duty_id);
      query += ` AND ra.duty_id = $${params.length}`;
    }
    if (assignee_type) {
      params.push(assignee_type);
      query += ` AND ra.assignee_type = $${params.length}`;
    }
    if (assignee_id) {
      params.push(assignee_id);
      query += ` AND ra.assignee_id = $${params.length}`;
    }
    if (supervisor_id) {
      params.push(supervisor_id);
      query += ` AND ra.supervisor_id = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND ra.status = $${params.length}`;
    }
    
    // Date range filtering - find assignments that overlap with the requested date range
    if (start_date && end_date) {
      // Assignment overlaps if: assignment_start <= filter_end AND (assignment_end >= filter_start OR assignment has no end)
      params.push(end_date);
      query += ` AND ra.start_date <= $${params.length}`;
      params.push(start_date);
      query += ` AND (ra.end_date IS NULL OR ra.end_date >= $${params.length})`;
    } else if (start_date) {
      // Find assignments that start on or include this date
      params.push(start_date);
      params.push(start_date);
      query += ` AND ra.start_date <= $${params.length - 1} AND (ra.end_date IS NULL OR ra.end_date >= $${params.length})`;
    }
    
    query += ` ORDER BY ra.start_date DESC, ts.start_time`;
    
    console.log('[ROSTER] Final query params:', params);
    const result = await dbClient.query(query, params);
    console.log('[ROSTER] Found', result.rows.length, 'assignments');
    
    // For multi-day assignments, fetch per-date records
    const assignmentsWithDates = await Promise.all(result.rows.map(async (assignment) => {
      // Check if it's a multi-day assignment (start_date != end_date)
      // Handle both Date objects and strings
      const startDate = assignment.start_date instanceof Date 
        ? assignment.start_date.toISOString().split('T')[0] 
        : (typeof assignment.start_date === 'string' ? assignment.start_date.split('T')[0] : null);
      const endDate = assignment.end_date instanceof Date 
        ? assignment.end_date.toISOString().split('T')[0] 
        : (typeof assignment.end_date === 'string' ? assignment.end_date.split('T')[0] : null);
      
      if (startDate && endDate && startDate !== endDate) {
        const datesResult = await dbClient.query(
          `SELECT id, date, status, decline_reason, accepted_at, accepted_by, completed_at, completed_by 
           FROM roster_assignment_dates 
           WHERE roster_assignment_id = $1 
           ORDER BY date`,
          [assignment.id]
        );
        return { ...assignment, dates: datesResult.rows };
      }
      return assignment;
    }));
    
    res.json({ success: true, data: assignmentsWithDates });
  } catch (error) {
    console.error('[ROSTER] Error fetching roster assignments:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const createRosterAssignment = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId, id: userId } = req.user;
    console.log('[ROSTER] Creating assignment - Request body:', JSON.stringify(req.body, null, 2));
    
    dbClient = await getGroupDbClient(groupId);
    const {
      academic_session_id, roster_type_id, duty_id,
      class_grade_id, class_section_id, stream_id, subject_id,
      start_date, end_date, is_recurring, recurrence_pattern, recurrence_days,
      time_slot_id, custom_start_time, custom_end_time,
      location_id, custom_location, role_id,
      assignee_type, assignee_id, supervisor_id,
      notes, priority, is_emergency
    } = req.body;
    
    // Validate required fields
    if (!start_date) {
      return res.status(400).json({ success: false, message: 'Start date is required' });
    }
    if (!assignee_type || !assignee_id) {
      return res.status(400).json({ success: false, message: 'Assignee type and ID are required' });
    }
    
    // Auto-fetch academic_session_id if not provided
    let finalAcademicSessionId = academic_session_id;
    if (!finalAcademicSessionId) {
      const sessionResult = await dbClient.query(
        'SELECT id FROM academic_sessions WHERE school_id = $1 AND is_current = true LIMIT 1',
        [schoolId]
      );
      if (sessionResult.rows.length > 0) {
        finalAcademicSessionId = sessionResult.rows[0].id;
        console.log('[ROSTER] Auto-fetched academic_session_id:', finalAcademicSessionId);
      }
    }
    
    // Determine initial status based on require_acceptance flag
    const { require_acceptance } = req.body;
    const initialStatus = require_acceptance ? 'pending_acceptance' : 'scheduled';
    
    const result = await dbClient.query(`
      INSERT INTO roster_assignments (
        school_id, academic_session_id, roster_type_id, duty_id,
        class_grade_id, class_section_id, stream_id, subject_id,
        start_date, end_date, is_recurring, recurrence_pattern, recurrence_days,
        time_slot_id, custom_start_time, custom_end_time,
        location_id, custom_location, role_id,
        assignee_type, assignee_id, supervisor_id,
        status, requires_approval, notes, priority, is_emergency, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
      RETURNING *
    `, [
      schoolId, finalAcademicSessionId || null, roster_type_id || null, duty_id || null,
      class_grade_id || null, class_section_id || null, stream_id || null, subject_id || null,
      start_date, end_date || null, is_recurring || false, recurrence_pattern || null, recurrence_days || null,
      time_slot_id || null, custom_start_time || null, custom_end_time || null,
      location_id || null, custom_location || null, role_id || null,
      assignee_type, assignee_id, supervisor_id || null,
      initialStatus, require_acceptance || false, notes || null, priority || 0, is_emergency || false, userId || null
    ]);
    
    const assignment = result.rows[0];
    console.log('[ROSTER] Assignment created successfully:', assignment?.id);
    
    // Generate per-day records for multi-day assignments
    if (assignment && require_acceptance) {
      const startDt = new Date(start_date);
      const endDt = end_date ? new Date(end_date) : startDt;
      
      const dateRecords = [];
      const currentDt = new Date(startDt);
      while (currentDt <= endDt) {
        dateRecords.push(currentDt.toISOString().split('T')[0]);
        currentDt.setDate(currentDt.getDate() + 1);
      }
      
      // Insert per-day records
      for (const dateStr of dateRecords) {
        await dbClient.query(`
          INSERT INTO roster_assignment_dates (roster_assignment_id, date, status)
          VALUES ($1, $2, 'pending_acceptance')
          ON CONFLICT (roster_assignment_id, date) DO NOTHING
        `, [assignment.id, dateStr]);
      }
      console.log(`[ROSTER] Created ${dateRecords.length} per-day records for assignment ${assignment.id}`);
    }
    
    res.json({ success: true, data: assignment });
  } catch (error) {
    console.error('[ROSTER] Error creating roster assignment:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const updateRosterAssignment = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const updateData = req.body;
    
    console.log('[ROSTER] Updating assignment:', id, 'with data:', JSON.stringify(updateData, null, 2));
    
    // First, check current assignment status and assignee
    const currentAssignment = await dbClient.query(
      'SELECT status, assignee_id, requires_approval FROM roster_assignments WHERE id = $1',
      [id]
    );
    
    if (currentAssignment.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    
    const current = currentAssignment.rows[0];
    
    // If assignee_id changed and current status is declined, reset to pending_acceptance
    if (updateData.assignee_id && 
        updateData.assignee_id !== current.assignee_id && 
        current.status === 'declined') {
      const requireAcceptance = updateData.require_acceptance ?? current.requires_approval;
      updateData.status = requireAcceptance ? 'pending_acceptance' : 'scheduled';
      updateData.requires_approval = requireAcceptance;
      console.log('[ROSTER] Re-assignment detected, setting status to:', updateData.status);
    }
    
    const setClauses = [];
    const values = [];
    let paramCount = 0;
    
    const allowedFields = [
      'roster_type_id', 'duty_id', 'class_grade_id', 'class_section_id', 'stream_id', 'subject_id',
      'start_date', 'end_date', 'is_recurring', 'recurrence_pattern', 'recurrence_days',
      'time_slot_id', 'custom_start_time', 'custom_end_time', 'location_id', 'custom_location',
      'role_id', 'assignee_type', 'assignee_id', 'supervisor_id', 'status', 'notes', 'priority',
      'requires_approval'
    ];
    
    // Fields that should be null if empty string
    const nullableFields = [
      'roster_type_id', 'duty_id', 'class_grade_id', 'class_section_id', 'stream_id', 'subject_id',
      'end_date', 'time_slot_id', 'custom_start_time', 'custom_end_time', 'location_id',
      'role_id', 'supervisor_id', 'recurrence_pattern', 'recurrence_days'
    ];
    
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        let value = updateData[field];
        // Convert empty strings to null for nullable fields
        if (nullableFields.includes(field) && value === '') {
          value = null;
        }
        values.push(value);
        setClauses.push(`${field} = $${++paramCount}`);
      }
    }
    
    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    
    values.push(id);
    const result = await dbClient.query(`
      UPDATE roster_assignments 
      SET ${setClauses.join(', ')}, updated_at = NOW()
      WHERE id = $${++paramCount}
      RETURNING *
    `, values);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating roster assignment:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const deleteRosterAssignment = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    
    await dbClient.query('DELETE FROM roster_assignments WHERE id = $1', [id]);
    res.json({ success: true, message: 'Roster assignment deleted' });
  } catch (error) {
    console.error('Error deleting roster assignment:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const approveRosterAssignment = async (req, res) => {
  let dbClient;
  try {
    const { groupId, id: userId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const { approved } = req.body;
    
    const newStatus = approved ? 'scheduled' : 'cancelled';
    
    const result = await dbClient.query(`
      UPDATE roster_assignments 
      SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
      WHERE id = $3 AND status = 'pending_approval'
      RETURNING *
    `, [newStatus, userId || null, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found or not pending approval' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error approving roster assignment:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// Mark assignment as complete (for assignee to mark their own duty)
export const markAssignmentComplete = async (req, res) => {
  let dbClient;
  try {
    const { groupId, id: userId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const { notes } = req.body;
    
    const result = await dbClient.query(`
      UPDATE roster_assignments 
      SET status = 'completed', 
          completed_at = NOW(), 
          completed_by = $1,
          notes = COALESCE($2, notes),
          updated_at = NOW()
      WHERE id = $3 AND status IN ('scheduled', 'active')
      RETURNING *
    `, [userId || null, notes || null, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found or cannot be completed' });
    }
    
    res.json({ success: true, data: result.rows[0], message: 'Duty marked as completed' });
  } catch (error) {
    console.error('Error marking assignment complete:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// Update assignment status (generic status update)
export const updateAssignmentStatus = async (req, res) => {
  let dbClient;
  try {
    const { groupId, id: userId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const { status, notes } = req.body;
    
    const validStatuses = ['scheduled', 'active', 'completed', 'cancelled', 'pending_approval', 'pending_acceptance'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    
    const result = await dbClient.query(`
      UPDATE roster_assignments 
      SET status = $1, notes = COALESCE($2, notes), updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [status, notes || null, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating assignment status:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// Accept a duty assignment (for teacher/assignee to accept)
export const acceptAssignment = async (req, res) => {
  let dbClient;
  try {
    const { groupId, id: userId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    
    // Update status to scheduled (accepted)
    const result = await dbClient.query(`
      UPDATE roster_assignments 
      SET status = 'scheduled', 
          approved_by = $1,
          approved_at = NOW(),
          notes = COALESCE(notes || E'\n', '') || '[Accepted by assignee]',
          updated_at = NOW()
      WHERE id = $2 AND status = 'pending_acceptance'
      RETURNING *
    `, [userId || null, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found or not pending acceptance' });
    }
    
    res.json({ success: true, data: result.rows[0], message: 'Duty accepted successfully' });
  } catch (error) {
    console.error('Error accepting assignment:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// Decline a duty assignment (for teacher/assignee to decline)
export const declineAssignment = async (req, res) => {
  let dbClient;
  try {
    const { groupId, id: userId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, message: 'Decline reason is required' });
    }
    
    // Update status to declined
    const result = await dbClient.query(`
      UPDATE roster_assignments 
      SET status = 'declined', 
          notes = COALESCE(notes || E'\n', '') || '[DECLINED: ' || $1 || ']',
          updated_at = NOW()
      WHERE id = $2 AND status = 'pending_acceptance'
      RETURNING *
    `, [reason, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assignment not found or not pending acceptance' });
    }
    
    res.json({ success: true, data: result.rows[0], message: 'Duty declined' });
  } catch (error) {
    console.error('Error declining assignment:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// ============================================
// PER-DAY ACCEPTANCE/DECLINE
// ============================================

// Get per-day status for an assignment
export const getAssignmentDates = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    
    const result = await dbClient.query(`
      SELECT rad.*, ra.assignee_type, ra.assignee_id
      FROM roster_assignment_dates rad
      JOIN roster_assignments ra ON rad.roster_assignment_id = ra.id
      WHERE rad.roster_assignment_id = $1
      ORDER BY rad.date
    `, [id]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching assignment dates:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// Accept a specific date for an assignment
export const acceptAssignmentDate = async (req, res) => {
  let dbClient;
  try {
    const { groupId, id: userId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id, dateId } = req.params;
    
    const result = await dbClient.query(`
      UPDATE roster_assignment_dates 
      SET status = 'accepted',
          accepted_at = NOW(),
          accepted_by = $1,
          updated_at = NOW()
      WHERE id = $2 AND roster_assignment_id = $3 AND status = 'pending_acceptance'
      RETURNING *
    `, [userId || null, dateId, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Date record not found or not pending acceptance' });
    }
    
    // Check if all dates are accepted, then update main assignment
    await updateMainAssignmentStatus(dbClient, id);
    
    res.json({ success: true, data: result.rows[0], message: 'Date accepted successfully' });
  } catch (error) {
    console.error('Error accepting assignment date:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// Decline a specific date for an assignment
export const declineAssignmentDate = async (req, res) => {
  let dbClient;
  try {
    const { groupId, id: userId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id, dateId } = req.params;
    const { reason } = req.body;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, message: 'Decline reason is required' });
    }
    
    const result = await dbClient.query(`
      UPDATE roster_assignment_dates 
      SET status = 'declined',
          declined_at = NOW(),
          declined_by = $1,
          decline_reason = $2,
          updated_at = NOW()
      WHERE id = $3 AND roster_assignment_id = $4 AND status = 'pending_acceptance'
      RETURNING *
    `, [userId || null, reason, dateId, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Date record not found or not pending acceptance' });
    }
    
    // Check status and update main assignment
    await updateMainAssignmentStatus(dbClient, id);
    
    res.json({ success: true, data: result.rows[0], message: 'Date declined' });
  } catch (error) {
    console.error('Error declining assignment date:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// Bulk accept all dates for an assignment
export const acceptAllDates = async (req, res) => {
  let dbClient;
  try {
    const { groupId, id: userId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    
    // Update all pending dates
    const result = await dbClient.query(`
      UPDATE roster_assignment_dates 
      SET status = 'accepted',
          accepted_at = NOW(),
          accepted_by = $1,
          updated_at = NOW()
      WHERE roster_assignment_id = $2 AND status = 'pending_acceptance'
      RETURNING *
    `, [userId || null, id]);
    
    // Update main assignment to scheduled
    await dbClient.query(`
      UPDATE roster_assignments 
      SET status = 'scheduled',
          approved_by = $1,
          approved_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
    `, [userId || null, id]);
    
    res.json({ success: true, data: result.rows, message: `Accepted ${result.rows.length} dates` });
  } catch (error) {
    console.error('Error accepting all dates:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// Bulk decline all dates for an assignment
export const declineAllDates = async (req, res) => {
  let dbClient;
  try {
    const { groupId, id: userId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id } = req.params;
    const { reason } = req.body;
    
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ success: false, message: 'Decline reason is required' });
    }
    
    // Update all pending dates
    const result = await dbClient.query(`
      UPDATE roster_assignment_dates 
      SET status = 'declined',
          declined_at = NOW(),
          declined_by = $1,
          decline_reason = $2,
          updated_at = NOW()
      WHERE roster_assignment_id = $3 AND status = 'pending_acceptance'
      RETURNING *
    `, [userId || null, reason, id]);
    
    // Update main assignment to declined
    await dbClient.query(`
      UPDATE roster_assignments 
      SET status = 'declined',
          notes = COALESCE(notes || E'\n', '') || '[DECLINED ALL: ' || $1 || ']',
          updated_at = NOW()
      WHERE id = $2
    `, [reason, id]);
    
    res.json({ success: true, data: result.rows, message: `Declined ${result.rows.length} dates` });
  } catch (error) {
    console.error('Error declining all dates:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// Mark a specific date as complete
export const completeAssignmentDate = async (req, res) => {
  let dbClient;
  try {
    const { groupId, id: userId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { id, dateId } = req.params;
    const { notes } = req.body;
    
    const result = await dbClient.query(`
      UPDATE roster_assignment_dates 
      SET status = 'completed',
          completed_at = NOW(),
          completed_by = $1,
          notes = COALESCE($2, notes),
          updated_at = NOW()
      WHERE id = $3 AND roster_assignment_id = $4 AND status IN ('accepted', 'scheduled')
      RETURNING *
    `, [userId || null, notes || null, dateId, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Date record not found or cannot be completed' });
    }
    
    // Check if all dates are completed
    await updateMainAssignmentStatus(dbClient, id);
    
    res.json({ success: true, data: result.rows[0], message: 'Date marked as complete' });
  } catch (error) {
    console.error('Error completing assignment date:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// Helper function to update main assignment status based on per-day statuses
async function updateMainAssignmentStatus(dbClient, assignmentId) {
  const dateStats = await dbClient.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'accepted') as accepted,
      COUNT(*) FILTER (WHERE status = 'declined') as declined,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'pending_acceptance') as pending
    FROM roster_assignment_dates
    WHERE roster_assignment_id = $1
  `, [assignmentId]);
  
  const stats = dateStats.rows[0];
  let newStatus = 'pending_acceptance';
  
  if (parseInt(stats.total) === 0) {
    return; // No per-day records, skip
  }
  
  if (parseInt(stats.completed) === parseInt(stats.total)) {
    newStatus = 'completed';
  } else if (parseInt(stats.declined) === parseInt(stats.total)) {
    newStatus = 'declined';
  } else if (parseInt(stats.pending) === 0) {
    // No more pending, but mixed accepted/declined/completed
    newStatus = 'scheduled'; // At least some dates are accepted
  }
  
  await dbClient.query(`
    UPDATE roster_assignments SET status = $1, updated_at = NOW() WHERE id = $2
  `, [newStatus, assignmentId]);
}

// ============================================
// REPORTING
// ============================================

export const getDailyDutySheet = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const result = await dbClient.query(`
      SELECT ra.*,
             rt.name as roster_type_name, rt.color as roster_type_color,
             dm.name as duty_name, dm.category as duty_category,
             ts.name as time_slot_name, ts.start_time, ts.end_time,
             dl.name as location_name,
             dr.name as role_name
      FROM roster_assignments ra
      LEFT JOIN roster_types rt ON ra.roster_type_id = rt.id
      LEFT JOIN duty_master dm ON ra.duty_id = dm.id
      LEFT JOIN duty_time_slots ts ON ra.time_slot_id = ts.id
      LEFT JOIN duty_locations dl ON ra.location_id = dl.id
      LEFT JOIN duty_roles dr ON ra.role_id = dr.id
      WHERE ra.school_id = $1
      AND ra.start_date <= $2 
      AND (ra.end_date IS NULL OR ra.end_date >= $2)
      AND ra.status IN ('scheduled', 'active')
      ORDER BY ts.start_time, dm.name
    `, [schoolId, targetDate]);
    
    // Group by time slot
    const grouped = {};
    result.rows.forEach(row => {
      const slot = row.time_slot_name || 'Unscheduled';
      if (!grouped[slot]) {
        grouped[slot] = [];
      }
      grouped[slot].push(row);
    });
    
    res.json({ success: true, date: targetDate, data: grouped, raw: result.rows });
  } catch (error) {
    console.error('Error fetching daily duty sheet:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const getMyDuties = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { assignee_id, assignee_type, start_date, end_date } = req.query;
    
    console.log('[ROSTER] getMyDuties called with:', { assignee_id, assignee_type, start_date, end_date });
    
    let query = `
      SELECT ra.*,
             rt.name as roster_type_name, rt.color as roster_type_color,
             dm.name as duty_name, dm.category as duty_category, dm.instructions,
             ts.name as time_slot_name, ts.start_time, ts.end_time,
             dl.name as location_name,
             dr.name as role_name,
             COALESCE(sup_t.first_name || ' ' || sup_t.last_name, sup_sm.first_name || ' ' || sup_sm.last_name) as supervisor_name
      FROM roster_assignments ra
      LEFT JOIN roster_types rt ON ra.roster_type_id = rt.id
      LEFT JOIN duty_master dm ON ra.duty_id = dm.id
      LEFT JOIN duty_time_slots ts ON ra.time_slot_id = ts.id
      LEFT JOIN duty_locations dl ON ra.location_id = dl.id
      LEFT JOIN duty_roles dr ON ra.role_id = dr.id
      LEFT JOIN teachers sup_t ON ra.supervisor_id = sup_t.id
      LEFT JOIN staff_members sup_sm ON ra.supervisor_id = sup_sm.id AND sup_t.id IS NULL
      WHERE ra.assignee_id = $1 AND ra.assignee_type = $2
      AND ra.status IN ('scheduled', 'active', 'pending_approval', 'pending_acceptance', 'completed')
    `;
    
    const params = [assignee_id, assignee_type];
    
    // Date range filtering - find assignments that OVERLAP with the requested date range
    // An assignment overlaps if: assignment_start <= filter_end AND (assignment_end >= filter_start OR no end date)
    if (start_date && end_date) {
      params.push(end_date);
      query += ` AND ra.start_date <= $${params.length}`; // Assignment starts before or on filter end
      params.push(start_date);
      query += ` AND (ra.end_date IS NULL OR ra.end_date >= $${params.length})`; // Assignment ends after or on filter start (or ongoing)
    } else if (start_date) {
      // Single date - find duties active on this date
      params.push(start_date);
      params.push(start_date);
      query += ` AND ra.start_date <= $${params.length - 1} AND (ra.end_date IS NULL OR ra.end_date >= $${params.length})`;
    }
    
    query += ` ORDER BY ra.start_date, ts.start_time`;
    
    console.log('[ROSTER] getMyDuties query params:', params);
    const result = await dbClient.query(query, params);
    console.log('[ROSTER] getMyDuties found', result.rows.length, 'duties');
    
    // For multi-day assignments, fetch per-date records
    const assignmentsWithDates = await Promise.all(result.rows.map(async (assignment) => {
      // Normalize dates to string format YYYY-MM-DD
      const startDateStr = assignment.start_date instanceof Date 
        ? assignment.start_date.toISOString().split('T')[0] 
        : (typeof assignment.start_date === 'string' ? assignment.start_date.split('T')[0] : null);
      const endDateStr = assignment.end_date instanceof Date 
        ? assignment.end_date.toISOString().split('T')[0] 
        : (typeof assignment.end_date === 'string' ? assignment.end_date.split('T')[0] : startDateStr);
      
      // Store normalized dates
      assignment.start_date = startDateStr;
      assignment.end_date = endDateStr;
      
      // Check if it's a multi-day assignment
      if (startDateStr && endDateStr && startDateStr !== endDateStr) {
        const datesResult = await dbClient.query(
          `SELECT id, date, status, decline_reason, accepted_at, accepted_by, completed_at, completed_by 
           FROM roster_assignment_dates 
           WHERE roster_assignment_id = $1 
           ORDER BY date`,
          [assignment.id]
        );
        // Normalize dates in the results
        const normalizedDates = datesResult.rows.map(d => ({
          ...d,
          date: d.date instanceof Date ? d.date.toISOString().split('T')[0] : (d.date ? d.date.split('T')[0] : null)
        }));
        return { ...assignment, dates: normalizedDates };
      }
      return assignment;
    }));
    
    res.json({ success: true, data: assignmentsWithDates });
  } catch (error) {
    console.error('Error fetching my duties:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const getStudentsUnderSupervision = async (req, res) => {
  let dbClient;
  try {
    const { groupId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const { supervisor_id, date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const result = await dbClient.query(`
      SELECT ra.*,
             dm.name as duty_name,
             ts.name as time_slot_name, ts.start_time, ts.end_time,
             dl.name as location_name,
             s.first_name, s.last_name, s.admission_number
      FROM roster_assignments ra
      LEFT JOIN duty_master dm ON ra.duty_id = dm.id
      LEFT JOIN duty_time_slots ts ON ra.time_slot_id = ts.id
      LEFT JOIN duty_locations dl ON ra.location_id = dl.id
      LEFT JOIN students s ON ra.assignee_id = s.id
      WHERE ra.supervisor_id = $1
      AND ra.assignee_type = 'student'
      AND ra.start_date <= $2
      AND (ra.end_date IS NULL OR ra.end_date >= $2)
      AND ra.status IN ('scheduled', 'active')
      ORDER BY ts.start_time, s.first_name
    `, [supervisor_id, targetDate]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching students under supervision:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

// ============================================
// CONFIG
// ============================================

export const getRosterConfig = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const result = await dbClient.query(
      `SELECT * FROM roster_config WHERE school_id = $1`, [schoolId]
    );
    res.json({ success: true, data: result.rows[0] || {} });
  } catch (error) {
    console.error('Error fetching roster config:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};

export const updateRosterConfig = async (req, res) => {
  let dbClient;
  try {
    const { groupId, schoolId } = req.user;
    dbClient = await getGroupDbClient(groupId);
    const config = req.body;
    
    const result = await dbClient.query(`
      INSERT INTO roster_config (
        school_id, student_max_duties_per_week, student_duties_overlap_class,
        student_duties_require_approval, high_risk_requires_approval,
        auto_complete_past_duties, notify_assignees, notify_supervisors
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (school_id) DO UPDATE SET
        student_max_duties_per_week = EXCLUDED.student_max_duties_per_week,
        student_duties_overlap_class = EXCLUDED.student_duties_overlap_class,
        student_duties_require_approval = EXCLUDED.student_duties_require_approval,
        high_risk_requires_approval = EXCLUDED.high_risk_requires_approval,
        auto_complete_past_duties = EXCLUDED.auto_complete_past_duties,
        notify_assignees = EXCLUDED.notify_assignees,
        notify_supervisors = EXCLUDED.notify_supervisors,
        updated_at = NOW()
      RETURNING *
    `, [
      schoolId,
      config.student_max_duties_per_week || 3,
      config.student_duties_overlap_class || false,
      config.student_duties_require_approval !== false,
      config.high_risk_requires_approval !== false,
      config.auto_complete_past_duties !== false,
      config.notify_assignees !== false,
      config.notify_supervisors !== false
    ]);
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating roster config:', error);
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (dbClient) await dbClient.end();
  }
};
