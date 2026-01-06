import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import {
  getLeaves,
  getTeachersOnLeave,
  createLeave,
  updateLeave,
  deleteLeave,
} from '../controllers/teacherLeaveController.js';

const router = express.Router();

// All routes require authentication and school access
router.use(verifyToken);
router.use(verifySchoolAccess);

// Get all leaves (with filters)
router.get('/', getLeaves);

// Get teachers on leave for a specific date
router.get('/on-leave', getTeachersOnLeave);

// Create a new leave
router.post('/', createLeave);

// Update a leave
router.put('/:id', updateLeave);

// Delete a leave
router.delete('/:id', deleteLeave);

export default router;

