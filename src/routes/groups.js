import express from 'express';
import { body } from 'express-validator';
import {
  onboardSchoolGroup,
  getAllSchoolGroups,
  getSchoolGroupById,
} from '../controllers/groupsController.js';
import { validateRequest } from '../middleware/validation.js';
import { validateSchoolGroup } from '../validators/schoolGroup.js';

const router = express.Router();

/**
 * @route   POST /api/groups
 * @desc    Onboard a new school group (B2B tenant)
 * @access  Private (Super Admin)
 */
router.post('/', validateSchoolGroup, validateRequest, onboardSchoolGroup);

/**
 * @route   GET /api/groups
 * @desc    Get all onboarded school groups
 * @access  Private (Super Admin)
 */
router.get('/', getAllSchoolGroups);

/**
 * @route   GET /api/groups/:id
 * @desc    Get a specific school group by ID
 * @access  Private (Super Admin)
 */
router.get('/:id', getSchoolGroupById);

export default router;
