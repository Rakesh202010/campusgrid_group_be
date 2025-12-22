import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import {
  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  getTeacherStats
} from '../controllers/teacherController.js';

const router = express.Router();

// All routes require authentication and school access
router.use(verifyToken);
router.use(verifySchoolAccess);

// Stats
router.get('/stats', getTeacherStats);

// CRUD routes
router.get('/', getTeachers);
router.get('/:id', getTeacherById);
router.post('/', createTeacher);
router.put('/:id', updateTeacher);
router.delete('/:id', deleteTeacher);

export default router;

