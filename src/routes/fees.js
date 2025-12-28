import express from 'express';
import {
  // Fee Types
  getFeeTypes,
  createFeeType,
  updateFeeType,
  deleteFeeType,
  bulkCreateFeeTypes,
  // Fee Structures
  getFeeStructures,
  createFeeStructure,
  updateFeeStructure,
  deleteFeeStructure,
  bulkCreateFeeStructures,
  // Discount Types
  getDiscountTypes,
  createDiscountType,
  updateDiscountType,
  deleteDiscountType,
  bulkCreateDiscountTypes
} from '../controllers/feeController.js';
import {
  generateStudentDues,
  generateClassDues,
  getStudentDues,
  calculateLateFees
} from '../controllers/studentDuesController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// =====================================================
// Fee Types Routes
// =====================================================
router.get('/types', getFeeTypes);
router.post('/types', createFeeType);
router.post('/types/bulk', bulkCreateFeeTypes);
router.put('/types/:id', updateFeeType);
router.delete('/types/:id', deleteFeeType);

// =====================================================
// Fee Structures Routes
// =====================================================
router.get('/structures', getFeeStructures);
router.post('/structures', createFeeStructure);
router.post('/structures/bulk', bulkCreateFeeStructures);
router.put('/structures/:id', updateFeeStructure);
router.delete('/structures/:id', deleteFeeStructure);

// =====================================================
// Discount Types Routes
// =====================================================
router.get('/discounts', getDiscountTypes);
router.post('/discounts', createDiscountType);
router.post('/discounts/bulk', bulkCreateDiscountTypes);
router.put('/discounts/:id', updateDiscountType);
router.delete('/discounts/:id', deleteDiscountType);

// =====================================================
// Student Dues Routes
// =====================================================
router.get('/dues/student/:studentId', getStudentDues);
router.post('/dues/generate/student', generateStudentDues);
router.post('/dues/generate/class', generateClassDues);
router.post('/dues/calculate-late-fees', calculateLateFees);

export default router;

