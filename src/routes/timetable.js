import express from 'express';
import {
  getTeacherTimetable,
  getClassTimetable,
  saveTimetableEntry,
  deleteTimetableEntry,
  deleteTimetableByDayPeriod,
  bulkSaveTimetable,
  getDailyTimetable,
  getAvailableTeachersForSubstitution,
  createSubstitution,
  removeSubstitution,
  getSubstitutionsForDate
} from '../controllers/timetableController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);

// Get timetable for a teacher
router.get('/teacher/:teacherId', getTeacherTimetable);

// Get timetable for a class
router.get('/class/:classSectionId', getClassTimetable);

// Daily timetable view (with substitutions)
router.get('/daily', getDailyTimetable);

// Date-specific substitutions
router.get('/substitutions', getSubstitutionsForDate);
router.get('/substitutions/available-teachers', getAvailableTeachersForSubstitution);
router.post('/substitutions', createSubstitution);
router.delete('/substitutions/:id', removeSubstitution);

// Save/update a timetable entry
router.post('/', saveTimetableEntry);

// Bulk save entries
router.post('/bulk', bulkSaveTimetable);

// Delete by ID
router.delete('/:id', deleteTimetableEntry);

// Delete by day/period
router.post('/remove', deleteTimetableByDayPeriod);

export default router;

