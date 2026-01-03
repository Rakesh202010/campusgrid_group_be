import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import {
  getSubjectCategories,
  createSubjectCategory,
  updateSubjectCategory,
  deleteSubjectCategory,
  getSubjectTypes,
  createSubjectType,
  updateSubjectType,
  deleteSubjectType
} from '../controllers/subjectMasterController.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyToken, verifySchoolAccess);

// Subject Categories routes
router.get('/categories', getSubjectCategories);
router.post('/categories', createSubjectCategory);
router.put('/categories/:id', updateSubjectCategory);
router.delete('/categories/:id', deleteSubjectCategory);

// Subject Types routes
router.get('/types', getSubjectTypes);
router.post('/types', createSubjectType);
router.put('/types/:id', updateSubjectType);
router.delete('/types/:id', deleteSubjectType);

export default router;

