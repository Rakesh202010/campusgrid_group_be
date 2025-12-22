import express from 'express';
import {
  login,
  logout,
  switchSchool,
  me,
  changePassword,
  getSchoolDetails,
  forgotPassword,
  resetPassword,
  resetPasswordDirect
} from '../controllers/schoolAuthController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/school-auth/login
 * @desc    School admin login (supports multi-school)
 * @access  Public
 */
router.post('/login', login);

/**
 * @route   POST /api/school-auth/switch-school
 * @desc    Switch to a different school within the same group
 * @access  Private
 */
router.post('/switch-school', verifyToken, switchSchool);

/**
 * @route   POST /api/school-auth/logout
 * @desc    Logout
 * @access  Public
 */
router.post('/logout', logout);

/**
 * @route   GET /api/school-auth/me
 * @desc    Get current school admin info
 * @access  Private
 */
router.get('/me', verifyToken, me);

/**
 * @route   POST /api/school-auth/change-password
 * @desc    Change password
 * @access  Private
 */
router.post('/change-password', verifyToken, changePassword);

/**
 * @route   GET /api/school-auth/school
 * @desc    Get current school details
 * @access  Private
 */
router.get('/school', verifyToken, getSchoolDetails);

/**
 * @route   POST /api/school-auth/forgot-password
 * @desc    Request password reset (sends reset token)
 * @access  Public
 */
router.post('/forgot-password', forgotPassword);

/**
 * @route   POST /api/school-auth/reset-password
 * @desc    Reset password using token
 * @access  Public
 */
router.post('/reset-password', resetPassword);

/**
 * @route   POST /api/school-auth/reset-password-direct
 * @desc    Reset password directly without token (for development)
 * @access  Public
 */
router.post('/reset-password-direct', resetPasswordDirect);

export default router;

