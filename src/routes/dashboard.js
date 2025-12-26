import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import { getDashboardStats, getQuickCounts } from '../controllers/dashboardController.js';

const router = express.Router();

// Apply auth middleware
router.use(verifyToken, verifySchoolAccess);

// Get comprehensive dashboard statistics
router.get('/stats', getDashboardStats);

// Get quick counts for header/sidebar
router.get('/quick-counts', getQuickCounts);

export default router;

