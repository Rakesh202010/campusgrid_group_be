import express from 'express';
import {
  getDepartments,
  getDepartmentById,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  bulkCreateDepartments,
  reorderDepartments
} from '../controllers/departmentController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

router.use(verifyToken);

// CRUD
router.get('/', getDepartments);
router.get('/:id', getDepartmentById);
router.post('/', createDepartment);
router.post('/bulk', bulkCreateDepartments);
router.put('/:id', updateDepartment);
router.delete('/:id', deleteDepartment);

// Reorder
router.post('/reorder', reorderDepartments);

export default router;

