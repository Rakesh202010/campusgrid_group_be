import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import {
  getNumberSettings,
  updateNumberSettings,
  getNextAdmissionNumber,
  getNextRollNumber,
  incrementCurrentNumber,
  resetNumberSequence,
  bulkGenerateNumbers
} from '../controllers/numberSettingsController.js';

const router = express.Router();

// Apply auth middleware
router.use(verifyToken, verifySchoolAccess);

// Get all number settings
router.get('/', getNumberSettings);

// Update settings for a type (admission_number or roll_number)
router.put('/:settingType', updateNumberSettings);

// Get next admission number
router.get('/next-admission-number', getNextAdmissionNumber);

// Get next roll number
router.get('/next-roll-number', getNextRollNumber);

// Bulk generate numbers for multiple students
router.post('/bulk-generate', bulkGenerateNumbers);

// Increment current number after use
router.post('/:settingType/increment', incrementCurrentNumber);

// Reset number sequence
router.post('/:settingType/reset', resetNumberSequence);

export default router;

