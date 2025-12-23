import express from 'express';
import {
  getTeacherTimetable,
  getClassTimetable,
  saveTimetableEntry,
  deleteTimetableEntry,
  deleteTimetableByDayPeriod,
  bulkSaveTimetable
} from '../controllers/timetableController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);

// Get timetable for a teacher
router.get('/teacher/:teacherId', getTeacherTimetable);

// Get timetable for a class
router.get('/class/:classSectionId', getClassTimetable);

// Save/update a timetable entry
router.post('/', saveTimetableEntry);

// Bulk save entries
router.post('/bulk', bulkSaveTimetable);

// Delete by ID
router.delete('/:id', deleteTimetableEntry);

// Delete by day/period
router.post('/remove', deleteTimetableByDayPeriod);

export default router;

