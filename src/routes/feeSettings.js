import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import {
  getFeeSettings,
  saveFeeSettings,
  getClassFeeSettings,
  saveClassFeeSettings,
  deleteClassFeeSettings,
  getFeeInstallments,
  saveFeeInstallments,
  getFeeCalendar,
  generateFeeCalendar,
  updateFeeCalendar,
  getEffectiveSettings,
  getReceiptTemplates,
  getReceiptTemplate,
  getDefaultTemplate,
  createReceiptTemplate,
  updateReceiptTemplate,
  deleteReceiptTemplate,
  setDefaultTemplate,
  duplicateReceiptTemplate
} from '../controllers/feeSettingsController.js';

const router = express.Router();

// Apply auth middleware
router.use(verifyToken, verifySchoolAccess);

// Receipt Templates
router.get('/templates', getReceiptTemplates);
router.get('/templates/default', getDefaultTemplate);
router.get('/templates/:id', getReceiptTemplate);
router.post('/templates', createReceiptTemplate);
router.put('/templates/:id', updateReceiptTemplate);
router.delete('/templates/:id', deleteReceiptTemplate);
router.post('/templates/:id/set-default', setDefaultTemplate);
router.post('/templates/:id/duplicate', duplicateReceiptTemplate);

// School Fee Settings
router.get('/school', getFeeSettings);
router.post('/school', saveFeeSettings);

// Class-specific Fee Settings
router.get('/class', getClassFeeSettings);
router.post('/class', saveClassFeeSettings);
router.delete('/class/:id', deleteClassFeeSettings);

// Fee Installments
router.get('/installments', getFeeInstallments);
router.post('/installments', saveFeeInstallments);

// Fee Calendar
router.get('/calendar', getFeeCalendar);
router.post('/calendar/generate', generateFeeCalendar);
router.put('/calendar/:id', updateFeeCalendar);

// Effective Settings (merged)
router.get('/effective', getEffectiveSettings);

export default router;

