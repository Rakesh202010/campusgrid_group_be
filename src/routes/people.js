import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import {
  // User Roles
  getUserRoles,
  createUserRole,
  updateUserRole,
  deleteUserRole,
  // Staff Members
  getStaffMembers,
  createStaffMember,
  updateStaffMember,
  deleteStaffMember,
  // Parents
  getParents,
  createParent,
  updateParent,
  deleteParent,
  // Stats
  getPeopleStats
} from '../controllers/peopleController.js';

const router = express.Router();

// All routes require authentication and school access
router.use(verifyToken);
router.use(verifySchoolAccess);

// Stats
router.get('/stats', getPeopleStats);

// User Roles Routes
router.get('/roles', getUserRoles);
router.post('/roles', createUserRole);
router.put('/roles/:id', updateUserRole);
router.delete('/roles/:id', deleteUserRole);

// Staff Members Routes
router.get('/staff', getStaffMembers);
router.post('/staff', createStaffMember);
router.put('/staff/:id', updateStaffMember);
router.delete('/staff/:id', deleteStaffMember);

// Parents Routes
router.get('/parents', getParents);
router.post('/parents', createParent);
router.put('/parents/:id', updateParent);
router.delete('/parents/:id', deleteParent);

export default router;

