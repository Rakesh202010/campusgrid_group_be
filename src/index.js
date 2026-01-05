import express from 'express';
import cors from 'cors';
import prismaAdmin from './lib/prisma.js';

// Import routes
import authRoutes from './routes/auth.js';
import dataRoutes from './routes/data.js';
import schoolsRoutes from './routes/schools.js';
import schoolAuthRoutes from './routes/schoolAuth.js';
import academicSessionsRoutes from './routes/academicSessions.js';
import classConfigRoutes from './routes/classConfig.js';
import subjectsRoutes from './routes/subjects.js';
import feesRoutes from './routes/fees.js';
import peopleRoutes from './routes/people.js';
import teachersRoutes from './routes/teachers.js';
import subjectAssignmentRoutes from './routes/subjectAssignment.js';
import classTimingsRoutes from './routes/classTimings.js';
import departmentsRoutes from './routes/departments.js';
import timetableRoutes from './routes/timetable.js';
import studentsRoutes from './routes/students.js';
import numberSettingsRoutes from './routes/numberSettings.js';
import dashboardRoutes from './routes/dashboard.js';
import feeManagementRoutes from './routes/feeManagement.js';
import feeSettingsRoutes from './routes/feeSettings.js';
import userAuthRoutes from './routes/userAuth.js';
import subjectMastersRoutes from './routes/subjectMasters.js';
import streamsRoutes from './routes/streams.js';

// No need for dotenv in Docker, env vars are set in docker-compose

const app = express();
const PORT = process.env.PORT || 4001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'CampusGrid Group API is running (B2B & B2C)',
    timestamp: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0'
  });
});

// API Routes
app.use('/api/auth', authRoutes); // Group admin authentication
app.use('/api/data', dataRoutes);
app.use('/api/schools', schoolsRoutes); // School onboarding and management
app.use('/api/school-auth', schoolAuthRoutes); // School admin authentication
app.use('/api/academic-sessions', academicSessionsRoutes); // Academic session configuration
app.use('/api/class-config', classConfigRoutes); // Class, section, structure configuration
app.use('/api/subjects', subjectsRoutes); // Subject and curriculum configuration
app.use('/api/fees', feesRoutes); // Fee and finance configuration
app.use('/api/people', peopleRoutes); // People and user role management
app.use('/api/teachers', teachersRoutes); // Teacher management
app.use('/api/subject-assignments', subjectAssignmentRoutes); // Subject assignment management
app.use('/api/class-timings', classTimingsRoutes); // Class timing configuration
app.use('/api/departments', departmentsRoutes); // Department configuration
app.use('/api/timetable', timetableRoutes); // Timetable management
app.use('/api/students', studentsRoutes); // Student management
app.use('/api/number-settings', numberSettingsRoutes); // Admission & Roll number settings
app.use('/api/dashboard', dashboardRoutes); // Dashboard statistics
app.use('/api/fee-management', feeManagementRoutes); // Fee collection & management
app.use('/api/fee-settings', feeSettingsRoutes); // Fee settings & configuration
app.use('/api/user-auth', userAuthRoutes); // Student, Parent, Teacher, Staff authentication
app.use('/api/subject-masters', subjectMastersRoutes); // Subject categories and types master data
app.use('/api/streams', streamsRoutes); // Streams/Courses master data

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
🚀 CampusGrid Group API Server Running! (B2B & B2C)
📍 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}
📊 Health Check: http://localhost:${PORT}/health
🔗 API Docs: http://localhost:${PORT}/api/groups
  `);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prismaAdmin.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prismaAdmin.$disconnect();
  process.exit(0);
});
