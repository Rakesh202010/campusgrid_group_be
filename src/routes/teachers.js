import express from 'express';
import { verifyToken, verifySchoolAccess } from '../middleware/auth.js';
import {
  // CRUD
  getTeachers,
  getTeacherById,
  createTeacher,
  updateTeacher,
  deleteTeacher,
  // Lifecycle
  changeTeacherStatus,
  // Subject Assignment
  getTeacherSubjects,
  assignSubject,
  bulkAssignSubjects,
  removeSubjectAssignment,
  // Leave Management
  getLeaveTypes,
  createLeaveType,
  getLeaveBalance,
  applyLeave,
  getLeaveApplications,
  getAllLeaveApplications,
  processLeave,
  // Attendance
  getTeacherAttendance,
  markTeacherAttendance,
  getAttendanceSummary,
  // Qualifications & Experience
  addQualification,
  getQualifications,
  deleteQualification,
  addExperience,
  getExperiences,
  deleteExperience,
  // Documents
  getDocuments,
  addDocument,
  verifyDocument,
  deleteDocument,
  // Credentials
  createTeacherLogin,
  resetTeacherPassword,
  toggleLoginAccess,
  // Stats & Audit
  getTeacherStats,
  getAuditLogs,
  // Bulk Operations
  bulkImportTeachers,
  exportTeachers
} from '../controllers/teacherController.js';

const router = express.Router();

// All routes require authentication and school access
router.use(verifyToken);
router.use(verifySchoolAccess);

// Stats
router.get('/stats', getTeacherStats);

// Leave types (school level)
router.get('/leave-types', getLeaveTypes);
router.post('/leave-types', createLeaveType);

// All leave applications (for admin view)
router.get('/leave-applications', getAllLeaveApplications);

// Attendance summary (for daily marking)
router.get('/attendance/summary', getAttendanceSummary);
router.post('/attendance/mark', markTeacherAttendance);

// Bulk operations
router.post('/import', bulkImportTeachers);
router.get('/export', exportTeachers);

// CRUD routes
router.get('/', getTeachers);
router.get('/:id', getTeacherById);
router.post('/', createTeacher);
router.put('/:id', updateTeacher);
router.delete('/:id', deleteTeacher);

// Lifecycle management
router.post('/:id/status', changeTeacherStatus);

// Subject assignments
router.get('/:id/subjects', getTeacherSubjects);
router.post('/:id/subjects', assignSubject);
router.post('/:id/subjects/bulk', bulkAssignSubjects);
router.delete('/:id/subjects/:assignmentId', removeSubjectAssignment);

// Leave management
router.get('/:id/leave-balance', getLeaveBalance);
router.get('/:id/leave-applications', getLeaveApplications);
router.post('/:id/leave-applications', applyLeave);
router.post('/:id/leave-applications/:applicationId', processLeave);

// Attendance
router.get('/:id/attendance', getTeacherAttendance);

// Qualifications
router.get('/:id/qualifications', getQualifications);
router.post('/:id/qualifications', addQualification);
router.delete('/:id/qualifications/:qualId', deleteQualification);

// Experience
router.get('/:id/experience', getExperiences);
router.post('/:id/experience', addExperience);
router.delete('/:id/experience/:expId', deleteExperience);

// Documents
router.get('/:id/documents', getDocuments);
router.post('/:id/documents', addDocument);
router.patch('/:id/documents/:docId/verify', verifyDocument);
router.delete('/:id/documents/:docId', deleteDocument);

// Credentials
router.post('/:id/create-login', createTeacherLogin);
router.post('/:id/reset-password', resetTeacherPassword);
router.post('/:id/toggle-login', toggleLoginAccess);

// Audit logs
router.get('/:id/audit-logs', getAuditLogs);

export default router;
