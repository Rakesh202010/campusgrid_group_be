/**
 * Roster & Duties Routes
 */

import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import * as rosterController from '../controllers/rosterController.js';

const router = express.Router();

// All routes require authentication and school access
router.use(verifyToken);
router.use(verifySchoolAccess);

// ============================================
// ROSTER TYPE MASTER
// ============================================
router.get('/types', rosterController.getRosterTypes);
router.post('/types', rosterController.createRosterType);
router.put('/types/:id', rosterController.updateRosterType);

// ============================================
// DUTY CATEGORIES
// ============================================
router.get('/categories', rosterController.getDutyCategories);
router.post('/categories', rosterController.createDutyCategory);
router.put('/categories/:id', rosterController.updateDutyCategory);
router.delete('/categories/:id', rosterController.deleteDutyCategory);

// ============================================
// TIME SLOT MASTER
// ============================================
router.get('/time-slots', rosterController.getTimeSlots);
router.post('/time-slots', rosterController.createTimeSlot);
router.put('/time-slots/:id', rosterController.updateTimeSlot);
router.delete('/time-slots/:id', rosterController.deleteTimeSlot);

// ============================================
// LOCATION MASTER
// ============================================
router.get('/locations', rosterController.getLocations);
router.post('/locations', rosterController.createLocation);
router.put('/locations/:id', rosterController.updateLocation);
router.delete('/locations/:id', rosterController.deleteLocation);

// ============================================
// DUTY ROLE MASTER
// ============================================
router.get('/roles', rosterController.getDutyRoles);
router.post('/roles', rosterController.createDutyRole);
router.put('/roles/:id', rosterController.updateDutyRole);
router.delete('/roles/:id', rosterController.deleteDutyRole);

// ============================================
// DUTY MASTER
// ============================================
router.get('/duties', rosterController.getDuties);
router.get('/duties/:id', rosterController.getDutyById);
router.post('/duties', rosterController.createDuty);
router.put('/duties/:id', rosterController.updateDuty);
router.delete('/duties/:id', rosterController.deleteDuty);

// ============================================
// ROSTER ASSIGNMENTS
// ============================================
router.get('/assignments', rosterController.getRosterAssignments);
router.post('/assignments', rosterController.createRosterAssignment);
router.put('/assignments/:id', rosterController.updateRosterAssignment);
router.delete('/assignments/:id', rosterController.deleteRosterAssignment);
router.post('/assignments/:id/approve', rosterController.approveRosterAssignment);

// ============================================
// REPORTING & VIEWS
// ============================================
router.get('/daily-sheet', rosterController.getDailyDutySheet);
router.get('/my-duties', rosterController.getMyDuties);
router.get('/supervised-students', rosterController.getStudentsUnderSupervision);

// ============================================
// CONFIG
// ============================================
router.get('/config', rosterController.getRosterConfig);
router.put('/config', rosterController.updateRosterConfig);

export default router;

