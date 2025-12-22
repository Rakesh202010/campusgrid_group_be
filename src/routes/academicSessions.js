import express from 'express';
import {
  getAcademicSessions,
  getAcademicSessionById,
  createAcademicSession,
  updateAcademicSession,
  deleteAcademicSession,
  setCurrentSession,
  getCurrentSession
} from '../controllers/academicSessionController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// GET /api/academic-sessions - Get all academic sessions
router.get('/', getAcademicSessions);

// GET /api/academic-sessions/current - Get current academic session
router.get('/current', getCurrentSession);

// GET /api/academic-sessions/:id - Get a specific academic session
router.get('/:id', getAcademicSessionById);

// POST /api/academic-sessions - Create a new academic session
router.post('/', createAcademicSession);

// PUT /api/academic-sessions/:id - Update an academic session
router.put('/:id', updateAcademicSession);

// PATCH /api/academic-sessions/:id - Partial update
router.patch('/:id', updateAcademicSession);

// DELETE /api/academic-sessions/:id - Delete an academic session
router.delete('/:id', deleteAcademicSession);

// POST /api/academic-sessions/:id/set-current - Set session as current
router.post('/:id/set-current', setCurrentSession);

export default router;

