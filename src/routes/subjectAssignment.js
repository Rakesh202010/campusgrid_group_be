import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import {
  getAllSubjectAssignments,
  getAssignmentsByTeacher,
  getAssignmentsBySubject,
  getAssignmentsByClass,
  checkAssignmentConflicts,
  assignSubjectWithConflictResolution,
  bulkAssignToTeacher,
  bulkAssignSubjectToClasses,
  transferAssignments,
  copyAssignmentsToSession,
  getVacantPositions,
  getWorkloadSummary,
  updateAssignment,
  deleteAssignment,
  bulkDeleteAssignments
} from '../controllers/subjectAssignmentController.js';

const router = express.Router();

router.use(verifyToken);
router.use(verifySchoolAccess);

// Views
router.get('/', getAllSubjectAssignments);
router.get('/by-teacher', getAssignmentsByTeacher);
router.get('/by-subject', getAssignmentsBySubject);
router.get('/by-class', getAssignmentsByClass);
router.get('/vacant', getVacantPositions);
router.get('/workload', getWorkloadSummary);

// Conflict checking
router.post('/check-conflicts', checkAssignmentConflicts);

// Assignment operations
router.post('/', assignSubjectWithConflictResolution);
router.post('/bulk-to-teacher', bulkAssignToTeacher);
router.post('/bulk-to-classes', bulkAssignSubjectToClasses);
router.post('/transfer', transferAssignments);
router.post('/copy-to-session', copyAssignmentsToSession);

// Update/Delete
router.patch('/:id', updateAssignment);
router.delete('/:id', deleteAssignment);
router.post('/bulk-delete', bulkDeleteAssignments);

export default router;

