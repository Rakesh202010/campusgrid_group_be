import express from 'express';
import {
  onboardSchool,
  getAllSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
  syncSchoolClassConfig,
  syncAllSchoolsClassConfig
} from '../controllers/schoolsController.js';

const router = express.Router();

/**
 * @route   POST /api/schools
 * @desc    Onboard a new school
 * @access  Private (Group Admin)
 */
router.post('/', onboardSchool);

/**
 * @route   GET /api/schools
 * @desc    Get all schools for a group
 * @access  Private (Group Admin)
 */
router.get('/', getAllSchools);

/**
 * @route   POST /api/schools/sync-all-class-config
 * @desc    Sync class grades and sections for ALL schools in a group
 * @access  Private (Group Admin)
 */
router.post('/sync-all-class-config', syncAllSchoolsClassConfig);

/**
 * @route   POST /api/schools/:id/sync-class-config
 * @desc    Sync class grades and sections for a specific school
 * @access  Private (Group Admin)
 */
router.post('/:id/sync-class-config', syncSchoolClassConfig);

/**
 * @route   GET /api/schools/:id
 * @desc    Get school by ID
 * @access  Private
 */
router.get('/:id', getSchoolById);

/**
 * @route   PATCH /api/schools/:id
 * @desc    Update school
 * @access  Private (Group Admin)
 */
router.patch('/:id', updateSchool);

/**
 * @route   DELETE /api/schools/:id
 * @desc    Delete school
 * @access  Private (Group Admin)
 */
router.delete('/:id', deleteSchool);

export default router;

