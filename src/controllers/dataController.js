import prismaAdmin from '../lib/prisma.js';
import { queryGroupDatabase } from '../lib/groupDatabase.js';

/**
 * Get dashboard statistics
 */
export const getDashboardStats = async (req, res) => {
  try {
    const { groupId } = req.user;

    // Get group info including dbName
    const group = await prismaAdmin.schoolGroup.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    const dbName = group.dbName;

    // Query group's database for statistics
    const [studentCount] = await queryGroupDatabase(
      dbName,
      'SELECT COUNT(*) as count FROM students'
    );

    const [teacherCount] = await queryGroupDatabase(
      dbName,
      'SELECT COUNT(*) as count FROM teachers'
    );

    const [courseCount] = await queryGroupDatabase(
      dbName,
      'SELECT COUNT(*) as count FROM courses'
    );

    const [classCount] = await queryGroupDatabase(
      dbName,
      'SELECT COUNT(*) as count FROM classes'
    );

    res.json({
      success: true,
      data: {
        students: parseInt(studentCount.count) || 0,
        teachers: parseInt(teacherCount.count) || 0,
        courses: parseInt(courseCount.count) || 0,
        classes: parseInt(classCount.count) || 0
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard statistics',
      error: error.message
    });
  }
};

/**
 * Get all students for a group
 */
export const getStudents = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { page = 1, limit = 20, search = '' } = req.query;

    // Get group info including dbName
    const group = await prismaAdmin.schoolGroup.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    const dbName = group.dbName;
    const offset = (page - 1) * limit;

    // Build query with optional search
    let query = 'SELECT * FROM students';
    let countQuery = 'SELECT COUNT(*) as count FROM students';
    const params = [];

    if (search) {
      query += ' WHERE name ILIKE $1 OR email ILIKE $1';
      countQuery += ' WHERE name ILIKE $1 OR email ILIKE $1';
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const students = await queryGroupDatabase(dbName, query, params);
    
    const countParams = search ? [`%${search}%`] : [];
    const [{ count }] = await queryGroupDatabase(dbName, countQuery, countParams);

    res.json({
      success: true,
      data: students,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(count),
        totalPages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: error.message
    });
  }
};

/**
 * Get all teachers for a group
 */
export const getTeachers = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { page = 1, limit = 20, search = '' } = req.query;

    // Get group info including dbName
    const group = await prismaAdmin.schoolGroup.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    const dbName = group.dbName;
    const offset = (page - 1) * limit;

    // Build query with optional search
    let query = 'SELECT * FROM teachers';
    let countQuery = 'SELECT COUNT(*) as count FROM teachers';
    const params = [];

    if (search) {
      query += ' WHERE name ILIKE $1 OR email ILIKE $1';
      countQuery += ' WHERE name ILIKE $1 OR email ILIKE $1';
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const teachers = await queryGroupDatabase(dbName, query, params);
    
    const countParams = search ? [`%${search}%`] : [];
    const [{ count }] = await queryGroupDatabase(dbName, countQuery, countParams);

    res.json({
      success: true,
      data: teachers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(count),
        totalPages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get teachers error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch teachers',
      error: error.message
    });
  }
};

/**
 * Get all courses for a group
 */
export const getCourses = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { page = 1, limit = 20, search = '' } = req.query;

    // Get group info including dbName
    const group = await prismaAdmin.schoolGroup.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    const dbName = group.dbName;
    const offset = (page - 1) * limit;

    // Build query with optional search
    let query = 'SELECT * FROM courses';
    let countQuery = 'SELECT COUNT(*) as count FROM courses';
    const params = [];

    if (search) {
      query += ' WHERE name ILIKE $1 OR code ILIKE $1';
      countQuery += ' WHERE name ILIKE $1 OR code ILIKE $1';
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const courses = await queryGroupDatabase(dbName, query, params);
    
    const countParams = search ? [`%${search}%`] : [];
    const [{ count }] = await queryGroupDatabase(dbName, countQuery, countParams);

    res.json({
      success: true,
      data: courses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(count),
        totalPages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch courses',
      error: error.message
    });
  }
};

/**
 * Get all classes for a group
 */
export const getClasses = async (req, res) => {
  try {
    const { groupId } = req.user;
    const { page = 1, limit = 20, search = '' } = req.query;

    // Get group info including dbName
    const group = await prismaAdmin.schoolGroup.findUnique({
      where: { id: groupId }
    });

    if (!group) {
      return res.status(404).json({
        success: false,
        message: 'Group not found'
      });
    }

    const dbName = group.dbName;
    const offset = (page - 1) * limit;

    // Build query with optional search
    let query = 'SELECT * FROM classes';
    let countQuery = 'SELECT COUNT(*) as count FROM classes';
    const params = [];

    if (search) {
      query += ' WHERE name ILIKE $1';
      countQuery += ' WHERE name ILIKE $1';
      params.push(`%${search}%`);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const classes = await queryGroupDatabase(dbName, query, params);
    
    const countParams = search ? [`%${search}%`] : [];
    const [{ count }] = await queryGroupDatabase(dbName, countQuery, countParams);

    res.json({
      success: true,
      data: classes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(count),
        totalPages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('Get classes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch classes',
      error: error.message
    });
  }
};

