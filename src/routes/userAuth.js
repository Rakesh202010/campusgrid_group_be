import express from 'express';
import {
  studentLogin,
  parentLogin,
  teacherLogin,
  staffLogin,
  getCurrentUser,
  changePassword,
  createStudentLogin,
  createParentLogin
} from '../controllers/userAuthController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   POST /api/user-auth/student/login
 * @desc    Student login
 * @access  Public
 */
router.post('/student/login', studentLogin);

/**
 * @route   POST /api/user-auth/parent/login
 * @desc    Parent login
 * @access  Public
 */
router.post('/parent/login', parentLogin);

/**
 * @route   POST /api/user-auth/teacher/login
 * @desc    Teacher login
 * @access  Public
 */
router.post('/teacher/login', teacherLogin);

/**
 * @route   POST /api/user-auth/staff/login
 * @desc    Staff (non-teaching) login
 * @access  Public
 */
router.post('/staff/login', staffLogin);

/**
 * @route   GET /api/user-auth/me
 * @desc    Get current logged in user info
 * @access  Private
 */
router.get('/me', verifyToken, getCurrentUser);

/**
 * @route   POST /api/user-auth/change-password
 * @desc    Change password for any user type
 * @access  Private
 */
router.post('/change-password', verifyToken, changePassword);

/**
 * @route   POST /api/user-auth/student/create-login
 * @desc    Create login credentials for a student (Admin only)
 * @access  Private
 */
router.post('/student/create-login', verifyToken, createStudentLogin);

/**
 * @route   POST /api/user-auth/parent/create-login
 * @desc    Create login credentials for a parent (Admin only)
 * @access  Private
 */
router.post('/parent/create-login', verifyToken, createParentLogin);

export default router;

