import express from 'express';
import {
  // Class Grades
  getClassGrades,
  createClassGrade,
  updateClassGrade,
  deleteClassGrade,
  // Sections
  getSections,
  createSection,
  updateSection,
  deleteSection,
  // Class Sections
  getClassSections,
  createClassSection,
  updateClassSection,
  deleteClassSection,
  bulkCreateClassSections,
  copyClassSections
} from '../controllers/classConfigController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// =====================================================
// Class Grades Routes
// =====================================================
router.get('/grades', getClassGrades);
router.post('/grades', createClassGrade);
router.put('/grades/:id', updateClassGrade);
router.patch('/grades/:id', updateClassGrade);
router.delete('/grades/:id', deleteClassGrade);

// =====================================================
// Sections Routes
// =====================================================
router.get('/sections', getSections);
router.post('/sections', createSection);
router.put('/sections/:id', updateSection);
router.patch('/sections/:id', updateSection);
router.delete('/sections/:id', deleteSection);

// =====================================================
// Class Sections Routes (Grade + Section combinations)
// =====================================================
router.get('/class-sections', getClassSections);
router.post('/class-sections', createClassSection);
router.post('/class-sections/bulk', bulkCreateClassSections);
router.post('/class-sections/copy', copyClassSections);
router.put('/class-sections/:id', updateClassSection);
router.patch('/class-sections/:id', updateClassSection);
router.delete('/class-sections/:id', deleteClassSection);

export default router;

