import express from 'express';
import { 
  getDashboardStats,
  getStudents,
  getTeachers,
  getCourses,
  getClasses
} from '../controllers/dataController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All data routes require authentication
router.use(verifyToken);

// Dashboard statistics
router.get('/dashboard/stats', getDashboardStats);

// Students
router.get('/students', getStudents);

// Teachers
router.get('/teachers', getTeachers);

// Courses
router.get('/courses', getCourses);

// Classes
router.get('/classes', getClasses);

export default router;

