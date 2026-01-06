import express from 'express';
import {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  getPrintHistory,
  recordPrint,
  voidPrint,
  getAvailableFields,
  getUserDataForCard,
} from '../controllers/idCardController.js';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyToken);
router.use(verifySchoolAccess);

/**
 * @route   GET /api/id-cards/templates
 * @desc    Get all ID card templates
 * @access  Private
 */
router.get('/templates', getTemplates);

/**
 * @route   GET /api/id-cards/templates/:id
 * @desc    Get single ID card template
 * @access  Private
 */
router.get('/templates/:id', getTemplateById);

/**
 * @route   POST /api/id-cards/templates
 * @desc    Create new ID card template
 * @access  Private
 */
router.post('/templates', createTemplate);

/**
 * @route   PUT /api/id-cards/templates/:id
 * @desc    Update ID card template
 * @access  Private
 */
router.put('/templates/:id', updateTemplate);

/**
 * @route   DELETE /api/id-cards/templates/:id
 * @desc    Delete ID card template
 * @access  Private
 */
router.delete('/templates/:id', deleteTemplate);

/**
 * @route   POST /api/id-cards/templates/:id/duplicate
 * @desc    Duplicate an ID card template
 * @access  Private
 */
router.post('/templates/:id/duplicate', duplicateTemplate);

/**
 * @route   GET /api/id-cards/fields
 * @desc    Get available fields for user type
 * @access  Private
 */
router.get('/fields', getAvailableFields);

/**
 * @route   POST /api/id-cards/user-data
 * @desc    Get user data for ID card generation
 * @access  Private
 */
router.post('/user-data', getUserDataForCard);

/**
 * @route   GET /api/id-cards/prints
 * @desc    Get print history
 * @access  Private
 */
router.get('/prints', getPrintHistory);

/**
 * @route   POST /api/id-cards/prints
 * @desc    Record a new print
 * @access  Private
 */
router.post('/prints', recordPrint);

/**
 * @route   PUT /api/id-cards/prints/:id/void
 * @desc    Void a print
 * @access  Private
 */
router.put('/prints/:id/void', voidPrint);

export default router;

