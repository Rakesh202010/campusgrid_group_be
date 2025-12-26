import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import {
  getStudents,
  getStudentById,
  createStudent,
  updateStudent,
  deleteStudent,
  getStudentStats,
  upsertParent,
  deleteParent,
  promoteStudents,
  getNextAdmissionNumber,
  exportStudents,
  getImportTemplate,
  importStudents,
  getStudentAcademicMapping,
  updateStudentClassSection
} from '../controllers/studentController.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyToken, verifySchoolAccess);

// Student routes
router.get('/', getStudents);
router.get('/stats', getStudentStats);
router.get('/next-admission-number', getNextAdmissionNumber);
router.get('/export', exportStudents);
router.get('/import-template', getImportTemplate);
router.post('/import', importStudents);
router.get('/:id', getStudentById);
router.get('/:id/academic-mapping', getStudentAcademicMapping);
router.put('/:id/class-section', updateStudentClassSection);
router.post('/', createStudent);
router.put('/:id', updateStudent);
router.delete('/:id', deleteStudent);

// Parent routes
router.post('/:studentId/parents', upsertParent);
router.put('/:studentId/parents/:parentId', upsertParent);
router.delete('/:studentId/parents/:parentId', deleteParent);

// Promotion
router.post('/promote', promoteStudents);

export default router;

