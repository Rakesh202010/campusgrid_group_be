import { getGroupDbClient } from '../lib/groupDb.js';

// Get comprehensive dashboard statistics
export const getDashboardStats = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get current academic session if not provided
      let sessionId = academic_session_id;
      if (!sessionId) {
        const sessionResult = await dbClient.query(
          `SELECT id FROM academic_sessions WHERE school_id = $1 AND is_current = true LIMIT 1`,
          [schoolId]
        );
        sessionId = sessionResult.rows[0]?.id;
      }

      // Run queries sequentially with error handling for each
      let studentStats, teacherStats, classStats, genderStats, recentStudents, recentTeachers, feeStats, sessionInfo, departmentStats;

      try {
        // Student statistics - filtered by academic session
        studentStats = await dbClient.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE LOWER(status) = 'active') as active,
            COUNT(*) FILTER (WHERE LOWER(status) = 'inactive') as inactive,
            COUNT(*) FILTER (WHERE LOWER(status) = 'transferred') as transferred,
            COUNT(*) FILTER (WHERE LOWER(status) = 'passed_out') as passed_out,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_this_month,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_this_week
          FROM students WHERE school_id = $1 AND academic_session_id = $2
        `, [schoolId, sessionId]);
      } catch (e) {
        console.error('Student stats query error:', e.message);
        studentStats = { rows: [{ total: 0, active: 0, inactive: 0, transferred: 0, passed_out: 0, new_this_month: 0, new_this_week: 0 }] };
      }

      try {
        // Teacher statistics
        teacherStats = await dbClient.query(`
          SELECT 
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE LOWER(status) = 'active') as active,
            COUNT(*) FILTER (WHERE LOWER(status) = 'inactive') as inactive,
            COUNT(*) FILTER (WHERE LOWER(status) = 'on_leave') as on_leave,
            COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_this_month
          FROM teachers WHERE school_id = $1
        `, [schoolId]);
      } catch (e) {
        console.error('Teacher stats query error:', e.message);
        teacherStats = { rows: [{ total: 0, active: 0, inactive: 0, on_leave: 0, new_this_month: 0 }] };
      }

      try {
        // Class-wise student distribution - filtered by academic session
        classStats = await dbClient.query(`
          SELECT 
            cg.display_name as class_name,
            cg.numeric_value,
            COUNT(s.id) as student_count
          FROM class_grades cg
          LEFT JOIN class_sections cs ON cg.id = cs.class_grade_id 
            AND cs.school_id = $1 
            AND cs.academic_session_id = $2
          LEFT JOIN students s ON cs.id = s.current_class_section_id 
            AND LOWER(s.status) = 'active'
            AND s.academic_session_id = $2
          WHERE cg.school_id = $1
          GROUP BY cg.id, cg.display_name, cg.numeric_value
          ORDER BY cg.numeric_value
        `, [schoolId, sessionId]);
      } catch (e) {
        console.error('Class stats query error:', e.message);
        classStats = { rows: [] };
      }

      try {
        // Gender distribution - filtered by academic session
        genderStats = await dbClient.query(`
          SELECT 
            LOWER(gender) as gender,
            COUNT(*) as count
          FROM students 
          WHERE school_id = $1 AND LOWER(status) = 'active' AND academic_session_id = $2
          GROUP BY LOWER(gender)
        `, [schoolId, sessionId]);
      } catch (e) {
        console.error('Gender stats query error:', e.message);
        genderStats = { rows: [] };
      }

      try {
        // Recent students (last 10) - filtered by academic session
        recentStudents = await dbClient.query(`
          SELECT 
            s.id, s.first_name, s.last_name, s.admission_number, s.photo_url,
            s.created_at, s.status,
            cg.display_name as class_name, sec.name as section_name
          FROM students s
          LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
          LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
          LEFT JOIN sections sec ON cs.section_id = sec.id
          WHERE s.school_id = $1 AND s.academic_session_id = $2
          ORDER BY s.created_at DESC
          LIMIT 10
        `, [schoolId, sessionId]);
      } catch (e) {
        console.error('Recent students query error:', e.message);
        recentStudents = { rows: [] };
      }

      try {
        // Recent teachers (last 5)
        recentTeachers = await dbClient.query(`
          SELECT 
            id, first_name, last_name, employee_id, department, designation, status, photo_url, created_at
          FROM teachers 
          WHERE school_id = $1
          ORDER BY created_at DESC
          LIMIT 5
        `, [schoolId]);
      } catch (e) {
        console.error('Recent teachers query error:', e.message);
        recentTeachers = { rows: [] };
      }

      try {
        // Fee statistics - filtered by academic session
        feeStats = await dbClient.query(`
          SELECT 
            COUNT(DISTINCT ft.id) as total_fee_types,
            COUNT(DISTINCT fs.id) as total_fee_structures,
            COALESCE(SUM(fs.amount), 0) as total_configured_fees
          FROM fee_types ft
          LEFT JOIN fee_structures fs ON ft.id = fs.fee_type_id 
            AND fs.is_active = true 
            AND fs.academic_session_id = $2
          WHERE ft.school_id = $1 AND ft.is_active = true
        `, [schoolId, sessionId]);
      } catch (e) {
        console.error('Fee stats query error:', e.message);
        feeStats = { rows: [{ total_fee_types: 0, total_fee_structures: 0, total_configured_fees: 0 }] };
      }

      try {
        // Selected session info (show the session being viewed, not just current)
        sessionInfo = await dbClient.query(`
          SELECT id, name, start_date, end_date, is_current
          FROM academic_sessions 
          WHERE school_id = $1 AND id = $2
          LIMIT 1
        `, [schoolId, sessionId]);
      } catch (e) {
        console.error('Session info query error:', e.message);
        sessionInfo = { rows: [] };
      }

      try {
        // Department-wise teacher distribution
        departmentStats = await dbClient.query(`
          SELECT 
            COALESCE(department, 'Unassigned') as department,
            COUNT(*) as count
          FROM teachers 
          WHERE school_id = $1 AND LOWER(status) = 'active'
          GROUP BY department
          ORDER BY count DESC
          LIMIT 8
        `, [schoolId]);
      } catch (e) {
        console.error('Department stats query error:', e.message);
        departmentStats = { rows: [] };
      }

      // Calculate additional metrics
      const totalStudents = parseInt(studentStats.rows[0]?.total || 0);
      const activeStudents = parseInt(studentStats.rows[0]?.active || 0);
      const totalTeachers = parseInt(teacherStats.rows[0]?.total || 0);
      const activeTeachers = parseInt(teacherStats.rows[0]?.active || 0);

      // Student-teacher ratio
      const studentTeacherRatio = activeTeachers > 0 
        ? (activeStudents / activeTeachers).toFixed(1) 
        : 0;

      // Format class distribution for chart
      const classDistribution = classStats.rows.map(row => ({
        name: row.class_name,
        value: parseInt(row.student_count) || 0,
        numericValue: row.numeric_value
      }));

      // Format gender distribution
      const genderDistribution = {
        male: 0,
        female: 0,
        other: 0
      };
      genderStats.rows.forEach(row => {
        if (row.gender === 'male') genderDistribution.male = parseInt(row.count);
        else if (row.gender === 'female') genderDistribution.female = parseInt(row.count);
        else genderDistribution.other = parseInt(row.count);
      });

      res.json({
        success: true,
        data: {
          overview: {
            totalStudents,
            activeStudents,
            inactiveStudents: parseInt(studentStats.rows[0]?.inactive || 0),
            newStudentsThisMonth: parseInt(studentStats.rows[0]?.new_this_month || 0),
            newStudentsThisWeek: parseInt(studentStats.rows[0]?.new_this_week || 0),
            totalTeachers,
            activeTeachers,
            teachersOnLeave: parseInt(teacherStats.rows[0]?.on_leave || 0),
            newTeachersThisMonth: parseInt(teacherStats.rows[0]?.new_this_month || 0),
            studentTeacherRatio,
            totalFeeTypes: parseInt(feeStats.rows[0]?.total_fee_types || 0),
            totalConfiguredFees: parseFloat(feeStats.rows[0]?.total_configured_fees || 0)
          },
          genderDistribution,
          classDistribution,
          departmentDistribution: departmentStats.rows.map(row => ({
            name: row.department,
            count: parseInt(row.count)
          })),
          recentStudents: recentStudents.rows.map(s => ({
            id: s.id,
            name: `${s.first_name} ${s.last_name}`.trim(),
            admissionNumber: s.admission_number,
            className: s.class_name ? `${s.class_name} - ${s.section_name}` : 'Not assigned',
            status: s.status,
            photoUrl: s.photo_url,
            createdAt: s.created_at
          })),
          recentTeachers: recentTeachers.rows.map(t => ({
            id: t.id,
            name: `${t.first_name} ${t.last_name}`.trim(),
            employeeId: t.employee_id,
            department: t.department || 'Unassigned',
            designation: t.designation,
            status: t.status,
            photoUrl: t.photo_url,
            createdAt: t.created_at
          })),
          currentSession: sessionInfo.rows[0] ? {
            id: sessionInfo.rows[0].id,
            name: sessionInfo.rows[0].name,
            startDate: sessionInfo.rows[0].start_date,
            endDate: sessionInfo.rows[0].end_date,
            isCurrent: sessionInfo.rows[0].is_current
          } : null
        }
      });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
  }
};

// Get quick counts for header/sidebar
export const getQuickCounts = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const dbClient = await getGroupDbClient(groupId);

    try {
      const [students, teachers, classes] = await Promise.all([
        dbClient.query(`SELECT COUNT(*) as count FROM students WHERE school_id = $1 AND status = 'active'`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM teachers WHERE school_id = $1 AND status = 'active'`, [schoolId]),
        dbClient.query(`SELECT COUNT(*) as count FROM class_sections WHERE school_id = $1 AND is_active = true`, [schoolId])
      ]);

      res.json({
        success: true,
        data: {
          students: parseInt(students.rows[0]?.count || 0),
          teachers: parseInt(teachers.rows[0]?.count || 0),
          classes: parseInt(classes.rows[0]?.count || 0)
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Quick counts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch counts' });
  }
};

