import { getGroupDbClient } from '../lib/groupDb.js';

// ==========================================
// STUDENT DUES GENERATION
// ==========================================

/**
 * Generate fee dues for a student based on:
 * - Fee structures applicable to their class
 * - Payment frequency settings
 * - Applicability rules (full year, specific months, one-time)
 * - Admission date (for mid-year admissions)
 */
export const generateStudentDues = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { student_id, academic_session_id, regenerate = false } = req.body;

    if (!student_id || !academic_session_id) {
      return res.status(400).json({ success: false, message: 'Student and academic session are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await generateDuesForStudent(dbClient, schoolId, student_id, academic_session_id, regenerate);
      res.json({
        success: true,
        message: `Generated ${result.count} fee dues for student`,
        data: result
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Generate student dues error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate student dues' });
  }
};

/**
 * Generate dues for all students in a class for a session
 */
export const generateClassDues = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { class_section_id, academic_session_id, regenerate = false } = req.body;

    if (!class_section_id || !academic_session_id) {
      return res.status(400).json({ success: false, message: 'Class and academic session are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get all active students in the class
      const studentsResult = await dbClient.query(`
        SELECT id FROM students 
        WHERE current_class_section_id = $1 
          AND academic_session_id = $2 
          AND LOWER(status) = 'active'
          AND school_id = $3
      `, [class_section_id, academic_session_id, schoolId]);

      let totalDues = 0;
      for (const student of studentsResult.rows) {
        const result = await generateDuesForStudent(dbClient, schoolId, student.id, academic_session_id, regenerate);
        totalDues += result.count;
      }

      res.json({
        success: true,
        message: `Generated ${totalDues} dues for ${studentsResult.rows.length} students`,
        data: { studentCount: studentsResult.rows.length, duesCount: totalDues }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Generate class dues error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate class dues' });
  }
};

/**
 * Core function to generate dues for a single student
 */
export async function generateDuesForStudent(dbClient, schoolId, studentId, sessionId, regenerate = false) {
  // Get student info including admission date and class
  const studentResult = await dbClient.query(`
    SELECT 
      s.id, s.admission_date, s.current_class_section_id,
      cs.class_grade_id,
      cg.display_name as class_name
    FROM students s
    LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
    LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
    WHERE s.id = $1 AND s.school_id = $2
  `, [studentId, schoolId]);

  if (studentResult.rows.length === 0) {
    return { count: 0, error: 'Student not found' };
  }

  const student = studentResult.rows[0];
  if (!student.class_grade_id) {
    return { count: 0, error: 'Student not assigned to a class' };
  }

  // Get academic session dates
  const sessionResult = await dbClient.query(`
    SELECT start_date, end_date, name FROM academic_sessions WHERE id = $1
  `, [sessionId]);

  if (sessionResult.rows.length === 0) {
    return { count: 0, error: 'Academic session not found' };
  }

  const session = sessionResult.rows[0];
  const sessionStart = new Date(session.start_date);
  const sessionEnd = new Date(session.end_date);

  // Get fee settings for the school/class
  let settingsResult = await dbClient.query(`
    SELECT * FROM class_fee_settings 
    WHERE school_id = $1 AND academic_session_id = $2 AND class_grade_id = $3
  `, [schoolId, sessionId, student.class_grade_id]);

  if (settingsResult.rows.length === 0) {
    settingsResult = await dbClient.query(`
      SELECT * FROM fee_settings 
      WHERE school_id = $1 AND academic_session_id = $2
    `, [schoolId, sessionId]);
  }

  const feeSettings = settingsResult.rows[0] || {
    payment_frequency: 'monthly',
    due_day_of_month: 10,
    grace_period_days: 5
  };

  // Get all applicable fee structures for this class
  const feeStructuresResult = await dbClient.query(`
    SELECT 
      fs.id as structure_id,
      fs.amount,
      fs.due_day,
      fs.applicable_months as structure_applicable_months,
      ft.id as fee_type_id,
      ft.name as fee_type_name,
      ft.frequency,
      ft.applicability_type,
      ft.applicable_months as type_applicable_months,
      ft.is_prorated_on_join,
      ft.is_mandatory,
      ft.late_fee_applicable,
      ft.late_fee_type,
      ft.late_fee_value
    FROM fee_structures fs
    JOIN fee_types ft ON fs.fee_type_id = ft.id
    WHERE fs.school_id = $1 
      AND fs.academic_session_id = $2
      AND fs.class_grade_id = $3
      AND fs.is_active = true
      AND ft.is_active = true
    ORDER BY ft.order_index, ft.name
  `, [schoolId, sessionId, student.class_grade_id]);

  if (feeStructuresResult.rows.length === 0) {
    return { count: 0, error: 'No fee structures found for this class' };
  }

  // If regenerate is false, delete only pending/partial dues
  // If regenerate is true, delete all dues and regenerate
  if (regenerate) {
    await dbClient.query(`
      DELETE FROM student_fee_dues 
      WHERE student_id = $1 AND academic_session_id = $2 AND status IN ('pending', 'partial')
    `, [studentId, sessionId]);
  }

  // Determine the effective start date (later of session start or admission date)
  const admissionDate = student.admission_date ? new Date(student.admission_date) : sessionStart;
  const effectiveStart = admissionDate > sessionStart ? admissionDate : sessionStart;
  const effectiveStartMonth = effectiveStart.getMonth(); // 0-indexed

  let duesCreated = 0;

  for (const feeStructure of feeStructuresResult.rows) {
    const {
      structure_id,
      amount,
      due_day,
      structure_applicable_months,
      fee_type_id,
      fee_type_name,
      frequency,
      applicability_type,
      type_applicable_months,
      is_prorated_on_join,
      late_fee_applicable,
      late_fee_type,
      late_fee_value
    } = feeStructure;

    // Determine applicable months
    // Priority: structure_applicable_months > type_applicable_months > all months
    let applicableMonths = [];
    if (structure_applicable_months && structure_applicable_months.length > 0) {
      applicableMonths = structure_applicable_months;
    } else if (type_applicable_months && type_applicable_months.length > 0) {
      applicableMonths = type_applicable_months;
    }

    // Generate dues based on frequency
    if (frequency === 'one_time') {
      // One-time fee - generate single due
      const count = await createSingleDue(dbClient, {
        schoolId, studentId, sessionId, feeTypeId: fee_type_id, structureId: structure_id,
        amount, dueDay: due_day || feeSettings.due_day_of_month,
        periodName: 'One-Time', periodType: 'one_time',
        periodStart: sessionStart, periodEnd: sessionEnd
      });
      duesCreated += count;

    } else if (frequency === 'annual' || frequency === 'yearly') {
      // Annual fee - generate single due for the year
      const count = await createSingleDue(dbClient, {
        schoolId, studentId, sessionId, feeTypeId: fee_type_id, structureId: structure_id,
        amount, dueDay: due_day || feeSettings.due_day_of_month,
        periodName: `Annual ${session.name}`, periodType: 'yearly',
        periodStart: sessionStart, periodEnd: sessionEnd
      });
      duesCreated += count;

    } else if (frequency === 'monthly') {
      // Monthly fee - generate dues for each applicable month
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];

      // Generate for each month from effective start to session end
      let currentDate = new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), 1);
      
      while (currentDate <= sessionEnd) {
        const monthIndex = currentDate.getMonth();
        const year = currentDate.getFullYear();
        const monthName = monthNames[monthIndex];

        // Check if this month is applicable
        const isApplicable = applicableMonths.length === 0 || 
                             applicableMonths.includes(monthIndex + 1) || // 1-indexed in config
                             applicableMonths.includes(monthName);

        if (isApplicable) {
          const periodStart = new Date(year, monthIndex, 1);
          const periodEnd = new Date(year, monthIndex + 1, 0); // Last day of month
          const dueDate = new Date(year, monthIndex, due_day || feeSettings.due_day_of_month);

          // Calculate prorated amount for mid-month admissions
          let finalAmount = parseFloat(amount);
          let isProrated = false;

          if (is_prorated_on_join && 
              currentDate.getTime() === new Date(effectiveStart.getFullYear(), effectiveStart.getMonth(), 1).getTime() &&
              effectiveStart.getDate() > 1) {
            // Prorate for partial first month
            const daysInMonth = periodEnd.getDate();
            const daysRemaining = daysInMonth - effectiveStart.getDate() + 1;
            finalAmount = (parseFloat(amount) / daysInMonth) * daysRemaining;
            isProrated = true;
          }

          const count = await createSingleDue(dbClient, {
            schoolId, studentId, sessionId, feeTypeId: fee_type_id, structureId: structure_id,
            amount: Math.round(finalAmount * 100) / 100,
            originalAmount: parseFloat(amount),
            dueDay: due_day || feeSettings.due_day_of_month,
            periodName: `${monthName} ${year}`,
            periodType: 'monthly',
            periodStart, periodEnd, dueDate, isProrated
          });
          duesCreated += count;
        }

        // Move to next month
        currentDate.setMonth(currentDate.getMonth() + 1);
      }

    } else if (frequency === 'quarterly') {
      // Quarterly - generate 4 dues per year
      const quarters = [
        { name: 'Q1 (Apr-Jun)', startMonth: 3, endMonth: 5 },
        { name: 'Q2 (Jul-Sep)', startMonth: 6, endMonth: 8 },
        { name: 'Q3 (Oct-Dec)', startMonth: 9, endMonth: 11 },
        { name: 'Q4 (Jan-Mar)', startMonth: 0, endMonth: 2 }
      ];

      for (const quarter of quarters) {
        const qStartYear = quarter.startMonth < 3 ? sessionStart.getFullYear() + 1 : sessionStart.getFullYear();
        const qEndYear = quarter.endMonth < 3 ? sessionStart.getFullYear() + 1 : sessionStart.getFullYear();
        
        const periodStart = new Date(qStartYear, quarter.startMonth, 1);
        const periodEnd = new Date(qEndYear, quarter.endMonth + 1, 0);

        // Skip if quarter ends before effective start
        if (periodEnd < effectiveStart) continue;
        // Skip if quarter starts after session end
        if (periodStart > sessionEnd) continue;

        const dueDate = new Date(qStartYear, quarter.startMonth, due_day || feeSettings.due_day_of_month);

        const count = await createSingleDue(dbClient, {
          schoolId, studentId, sessionId, feeTypeId: fee_type_id, structureId: structure_id,
          amount, dueDay: due_day || feeSettings.due_day_of_month,
          periodName: `${quarter.name} ${qStartYear}`,
          periodType: 'quarterly',
          periodStart, periodEnd, dueDate
        });
        duesCreated += count;
      }

    } else if (frequency === 'half_yearly') {
      // Half-yearly - generate 2 dues per year
      const halves = [
        { name: 'First Half (Apr-Sep)', startMonth: 3, endMonth: 8 },
        { name: 'Second Half (Oct-Mar)', startMonth: 9, endMonth: 2 }
      ];

      for (const half of halves) {
        const hStartYear = sessionStart.getFullYear();
        const hEndYear = half.endMonth < half.startMonth ? hStartYear + 1 : hStartYear;
        
        const periodStart = new Date(hStartYear, half.startMonth, 1);
        const periodEnd = new Date(hEndYear, half.endMonth + 1, 0);

        // Skip if period ends before effective start
        if (periodEnd < effectiveStart) continue;
        // Skip if period starts after session end
        if (periodStart > sessionEnd) continue;

        const dueDate = new Date(hStartYear, half.startMonth, due_day || feeSettings.due_day_of_month);

        const count = await createSingleDue(dbClient, {
          schoolId, studentId, sessionId, feeTypeId: fee_type_id, structureId: structure_id,
          amount, dueDay: due_day || feeSettings.due_day_of_month,
          periodName: `${half.name} ${hStartYear}-${hEndYear}`,
          periodType: 'half_yearly',
          periodStart, periodEnd, dueDate
        });
        duesCreated += count;
      }
    }
  }

  return { count: duesCreated, studentId, className: student.class_name };
}

/**
 * Helper function to create a single due entry
 */
async function createSingleDue(dbClient, params) {
  const {
    schoolId, studentId, sessionId, feeTypeId, structureId,
    amount, originalAmount, dueDay, periodName, periodType,
    periodStart, periodEnd, dueDate, isProrated = false
  } = params;

  // Calculate due date if not provided
  const finalDueDate = dueDate || new Date(periodStart.getFullYear(), periodStart.getMonth(), dueDay);

  try {
    await dbClient.query(`
      INSERT INTO student_fee_dues (
        school_id, student_id, academic_session_id, fee_type_id, fee_structure_id,
        due_month, due_date, amount, original_amount, balance, status,
        period_start, period_end, period_type, is_prorated, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11, $12, $13, $14, NOW())
      ON CONFLICT (student_id, fee_type_id, academic_session_id, due_month) 
      DO UPDATE SET 
        amount = CASE WHEN student_fee_dues.status = 'pending' THEN $8 ELSE student_fee_dues.amount END,
        balance = CASE WHEN student_fee_dues.status = 'pending' THEN $10 ELSE student_fee_dues.balance END,
        updated_at = NOW()
    `, [
      schoolId, studentId, sessionId, feeTypeId, structureId,
      periodName, finalDueDate, amount, originalAmount || amount, amount,
      periodStart, periodEnd, periodType, isProrated
    ]);
    return 1;
  } catch (error) {
    // If duplicate, skip silently
    if (error.code === '23505') {
      return 0;
    }
    throw error;
  }
}

// ==========================================
// GET STUDENT DUES (Enhanced)
// ==========================================

/**
 * Get student's fee dues organized by status:
 * - Overdue (past due date)
 * - Current (due this month)
 * - Upcoming (future dues)
 * - Paid (completed dues)
 */
export const getStudentDues = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { studentId } = req.params;
    const { academic_session_id } = req.query;

    if (!academic_session_id) {
      return res.status(400).json({ success: false, message: 'Academic session is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get student info
      const studentResult = await dbClient.query(`
        SELECT 
          s.id, s.first_name, s.last_name, s.admission_number, s.phone,
          s.father_name, s.mother_name, s.roll_number, s.admission_date,
          cg.display_name as class_name, sec.name as section_name,
          cg.id as class_grade_id
        FROM students s
        LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        WHERE s.id = $1 AND s.school_id = $2
      `, [studentId, schoolId]);

      if (studentResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }

      const student = studentResult.rows[0];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Get fee settings
      let settingsResult = await dbClient.query(`
        SELECT * FROM class_fee_settings 
        WHERE school_id = $1 AND academic_session_id = $2 AND class_grade_id = $3
      `, [schoolId, academic_session_id, student.class_grade_id]);

      if (settingsResult.rows.length === 0) {
        settingsResult = await dbClient.query(`
          SELECT * FROM fee_settings 
          WHERE school_id = $1 AND academic_session_id = $2
        `, [schoolId, academic_session_id]);
      }

      const feeSettings = settingsResult.rows[0] || {
        payment_frequency: 'monthly',
        grace_period_days: 5,
        late_fee_enabled: false
      };

      // Get all dues for this student
      const duesResult = await dbClient.query(`
        SELECT 
          sfd.*,
          ft.name as fee_type_name,
          ft.category,
          ft.frequency,
          ft.late_fee_applicable,
          ft.late_fee_type,
          ft.late_fee_value
        FROM student_fee_dues sfd
        JOIN fee_types ft ON sfd.fee_type_id = ft.id
        WHERE sfd.student_id = $1 AND sfd.academic_session_id = $2
        ORDER BY sfd.due_date, ft.order_index, ft.name
      `, [studentId, academic_session_id]);

      // Categorize dues
      const overdue = [];
      const currentDue = [];
      const upcoming = [];
      const paid = [];

      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();
      const currentMonthStart = new Date(currentYear, currentMonth, 1);
      const currentMonthEnd = new Date(currentYear, currentMonth + 1, 0);

      for (const due of duesResult.rows) {
        const dueDate = new Date(due.due_date);
        dueDate.setHours(0, 0, 0, 0);

        // Calculate late fee if applicable
        let lateFee = 0;
        if (due.status !== 'paid' && dueDate < today && due.late_fee_applicable) {
          const graceDays = feeSettings.grace_period_days || 0;
          const graceEnd = new Date(dueDate);
          graceEnd.setDate(graceEnd.getDate() + graceDays);

          if (today > graceEnd) {
            if (due.late_fee_type === 'fixed') {
              lateFee = parseFloat(due.late_fee_value) || 0;
            } else if (due.late_fee_type === 'percentage') {
              lateFee = (parseFloat(due.balance) * (parseFloat(due.late_fee_value) || 0)) / 100;
            } else if (due.late_fee_type === 'daily') {
              const daysLate = Math.floor((today - graceEnd) / (1000 * 60 * 60 * 24));
              lateFee = daysLate * (parseFloat(due.late_fee_value) || 0);
            }
          }
        }

        const dueItem = {
          id: due.id,
          feeTypeId: due.fee_type_id,
          feeTypeName: due.fee_type_name,
          category: due.category,
          frequency: due.frequency,
          periodName: due.due_month,
          periodType: due.period_type,
          periodStart: due.period_start,
          periodEnd: due.period_end,
          dueDate: due.due_date,
          amount: parseFloat(due.amount),
          originalAmount: parseFloat(due.original_amount || due.amount),
          paidAmount: parseFloat(due.paid_amount),
          discountAmount: parseFloat(due.discount_amount),
          balance: parseFloat(due.balance),
          lateFee,
          status: due.status,
          isProrated: due.is_prorated
        };

        if (due.status === 'paid') {
          paid.push(dueItem);
        } else if (dueDate < currentMonthStart) {
          // Past due date - overdue
          overdue.push(dueItem);
        } else if (dueDate >= currentMonthStart && dueDate <= currentMonthEnd) {
          // Due this month - current
          currentDue.push(dueItem);
        } else {
          // Future - upcoming
          upcoming.push(dueItem);
        }
      }

      // Calculate totals
      const totalOverdue = overdue.reduce((sum, d) => sum + d.balance + d.lateFee, 0);
      const totalCurrent = currentDue.reduce((sum, d) => sum + d.balance, 0);
      const totalUpcoming = upcoming.reduce((sum, d) => sum + d.balance, 0);
      const totalPaid = paid.reduce((sum, d) => sum + d.paidAmount, 0);
      const totalLateFees = overdue.reduce((sum, d) => sum + d.lateFee, 0);

      res.json({
        success: true,
        data: {
          student: {
            id: student.id,
            name: `${student.first_name} ${student.last_name}`.trim(),
            admissionNumber: student.admission_number,
            phone: student.phone,
            fatherName: student.father_name,
            rollNumber: student.roll_number,
            className: student.class_name ? `${student.class_name} - ${student.section_name}` : 'Not assigned',
            admissionDate: student.admission_date
          },
          feeSettings: {
            paymentFrequency: feeSettings.payment_frequency,
            gracePeriodDays: feeSettings.grace_period_days,
            lateFeeEnabled: feeSettings.late_fee_enabled
          },
          summary: {
            totalOverdue,
            totalCurrent,
            totalUpcoming,
            totalLateFees,
            totalPayable: totalOverdue + totalCurrent,
            totalPaid
          },
          overdue,
          currentDue,
          upcoming,
          paid
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get student dues error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch student dues' });
  }
};

// ==========================================
// CALCULATE LATE FEES
// ==========================================

/**
 * Calculate and apply late fees for overdue payments
 */
export const calculateLateFees = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, student_id } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Build query to get overdue dues
      let query = `
        SELECT 
          sfd.*, ft.late_fee_applicable, ft.late_fee_type, ft.late_fee_value
        FROM student_fee_dues sfd
        JOIN fee_types ft ON sfd.fee_type_id = ft.id
        WHERE sfd.school_id = $1 
          AND sfd.academic_session_id = $2
          AND sfd.status IN ('pending', 'partial')
          AND sfd.due_date < $3
          AND ft.late_fee_applicable = true
      `;
      const params = [schoolId, academic_session_id, today];

      if (student_id) {
        params.push(student_id);
        query += ` AND sfd.student_id = $${params.length}`;
      }

      const duesResult = await dbClient.query(query, params);

      let updatedCount = 0;
      for (const due of duesResult.rows) {
        let lateFee = 0;
        
        if (due.late_fee_type === 'fixed') {
          lateFee = parseFloat(due.late_fee_value) || 0;
        } else if (due.late_fee_type === 'percentage') {
          lateFee = (parseFloat(due.balance) * (parseFloat(due.late_fee_value) || 0)) / 100;
        } else if (due.late_fee_type === 'daily') {
          const dueDate = new Date(due.due_date);
          const daysLate = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
          lateFee = daysLate * (parseFloat(due.late_fee_value) || 0);
        }

        if (lateFee > 0 && lateFee !== parseFloat(due.late_fee_calculated)) {
          await dbClient.query(`
            UPDATE student_fee_dues 
            SET late_fee_calculated = $1, updated_at = NOW()
            WHERE id = $2
          `, [lateFee, due.id]);
          updatedCount++;
        }
      }

      res.json({
        success: true,
        message: `Updated late fees for ${updatedCount} dues`,
        data: { updatedCount }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Calculate late fees error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate late fees' });
  }
};

export default {
  generateStudentDues,
  generateClassDues,
  getStudentDues,
  calculateLateFees,
  generateDuesForStudent
};

