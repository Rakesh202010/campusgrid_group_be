import express from 'express';
import {
  getTimingSettings,
  saveTimingSettings,
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  savePeriods,
  saveBreaks,
  getActiveTiming,
  getExceptions,
  createException,
  deleteException,
  generateDefaultTemplate,
  getDayWiseTimings,
  saveDayWiseTimings,
  getTimingForDate
} from '../controllers/classTimingController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);

// School Timing Settings (General/Default)
router.get('/settings', getTimingSettings);
router.post('/settings', saveTimingSettings);

// Day-wise Timing Configuration (Mon-Sat different hours)
router.get('/day-wise', getDayWiseTimings);
router.post('/day-wise', saveDayWiseTimings);

// Get timing for a specific date (combines exceptions, day-wise, defaults)
router.get('/date/:date', getTimingForDate);

// Timing Templates
router.get('/templates', getTemplates);
router.get('/templates/:id', getTemplateById);
router.post('/templates', createTemplate);
router.put('/templates/:id', updateTemplate);
router.delete('/templates/:id', deleteTemplate);

// Periods and Breaks within a Template
router.post('/templates/:templateId/periods', savePeriods);
router.post('/templates/:templateId/breaks', saveBreaks);

// Get Active Timing (for Timetable/Attendance use)
router.get('/active', getActiveTiming);

// Timing Exceptions (holidays, half-days, etc.)
router.get('/exceptions', getExceptions);
router.post('/exceptions', createException);
router.delete('/exceptions/:id', deleteException);

// Quick Setup
router.post('/generate-default', generateDefaultTemplate);

export default router;

