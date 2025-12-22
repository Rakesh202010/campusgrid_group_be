import express from 'express';
import { login, logout, me, forgotPassword, resetPassword, resetPasswordDirect } from '../controllers/authController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.post('/login', login);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/reset-password-direct', resetPasswordDirect); // Direct reset without email/token

// Protected routes
router.get('/me', verifyToken, me);

export default router;

