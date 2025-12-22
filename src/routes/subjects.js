import express from 'express';
import {
  // Subjects
  getSubjects,
  createSubject,
  updateSubject,
  deleteSubject,
  bulkCreateSubjects,
  // Class Subjects (Curriculum)
  getClassSubjects,
  createClassSubject,
  updateClassSubject,
  deleteClassSubject,
  bulkAssignSubjects,
  copyCurriculum
} from '../controllers/subjectController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// =====================================================
// Subjects Routes
// =====================================================
router.get('/', getSubjects);
router.post('/', createSubject);
router.post('/bulk', bulkCreateSubjects);
router.put('/:id', updateSubject);
router.patch('/:id', updateSubject);
router.delete('/:id', deleteSubject);

// =====================================================
// Class Subjects / Curriculum Routes
// =====================================================
router.get('/curriculum', getClassSubjects);
router.post('/curriculum', createClassSubject);
router.post('/curriculum/bulk', bulkAssignSubjects);
router.post('/curriculum/copy', copyCurriculum);
router.put('/curriculum/:id', updateClassSubject);
router.patch('/curriculum/:id', updateClassSubject);
router.delete('/curriculum/:id', deleteClassSubject);

export default router;

