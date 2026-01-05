import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import {
  getStreams,
  createStream,
  updateStream,
  deleteStream
} from '../controllers/streamController.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyToken, verifySchoolAccess);

// Stream routes
router.get('/', getStreams);
router.post('/', createStream);
router.put('/:id', updateStream);
router.delete('/:id', deleteStream);

export default router;

