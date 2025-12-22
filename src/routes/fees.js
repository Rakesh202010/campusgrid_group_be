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

export default router;

