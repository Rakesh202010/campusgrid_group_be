import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import {
  getFeeOverview,
  searchStudentsForFee,
  getStudentFeeDetails,
  collectFee,
  getReceiptDetails,
  getCollectionReport,
  getPendingDuesReport,
  getClassWiseCollection,
  getFeeTypeWiseCollection,
  cancelPayment,
  generateFeeDues,
  generateStudentDues
} from '../controllers/feeManagementController.js';

const router = express.Router();

// Apply auth middleware
router.use(verifyToken, verifySchoolAccess);

// Overview/Dashboard
router.get('/overview', getFeeOverview);

// Student fee operations
router.get('/students/search', searchStudentsForFee);
router.get('/students/:studentId', getStudentFeeDetails);

// Fee collection
router.post('/collect', collectFee);
router.get('/receipt/:paymentId', getReceiptDetails);
router.post('/cancel/:paymentId', cancelPayment);

// Reports
router.get('/reports/collection', getCollectionReport);
router.get('/reports/pending-dues', getPendingDuesReport);
router.get('/reports/class-wise', getClassWiseCollection);
router.get('/reports/fee-type-wise', getFeeTypeWiseCollection);

// Fee dues generation
router.post('/generate-dues', generateFeeDues);
router.post('/generate-student-dues', generateStudentDues);

export default router;

