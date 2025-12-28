import { getGroupDbClient } from '../lib/groupDb.js';

// ==========================================
// DASHBOARD & OVERVIEW
// ==========================================

// Get fee collection overview/dashboard
export const getFeeOverview = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      // Get various fee statistics
      const [
        todayCollection,
        monthCollection,
        totalCollection,
        pendingDues,
        recentPayments
      ] = await Promise.all([
        // Today's collection
        dbClient.query(`
          SELECT COALESCE(SUM(net_amount), 0) as amount, COUNT(*) as count
          FROM fee_payments
          WHERE school_id = $1 AND academic_session_id = $2 
            AND payment_date = CURRENT_DATE AND status = 'completed'
        `, [schoolId, academic_session_id]),
        
        // This month's collection
        dbClient.query(`
          SELECT COALESCE(SUM(net_amount), 0) as amount, COUNT(*) as count
          FROM fee_payments
          WHERE school_id = $1 AND academic_session_id = $2 
            AND EXTRACT(MONTH FROM payment_date) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM payment_date) = EXTRACT(YEAR FROM CURRENT_DATE)
            AND status = 'completed'
        `, [schoolId, academic_session_id]),
        
        // Total collection for session
        dbClient.query(`
          SELECT COALESCE(SUM(net_amount), 0) as amount, COUNT(*) as count
          FROM fee_payments
          WHERE school_id = $1 AND academic_session_id = $2 AND status = 'completed'
        `, [schoolId, academic_session_id]),
        
        // Total pending dues
        dbClient.query(`
          SELECT COALESCE(SUM(balance), 0) as amount, COUNT(DISTINCT student_id) as student_count
          FROM student_fee_dues
          WHERE school_id = $1 AND academic_session_id = $2 AND status IN ('pending', 'partial')
        `, [schoolId, academic_session_id]),
        
        // Recent 10 payments
        dbClient.query(`
          SELECT 
            fp.id, fp.receipt_number, fp.payment_date, fp.net_amount, fp.status,
            s.first_name, s.last_name, s.admission_number,
            cg.display_name as class_name, sec.name as section_name
          FROM fee_payments fp
          JOIN students s ON fp.student_id = s.id
          LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
          LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
          LEFT JOIN sections sec ON cs.section_id = sec.id
          WHERE fp.school_id = $1 AND fp.academic_session_id = $2
          ORDER BY fp.created_at DESC
          LIMIT 10
        `, [schoolId, academic_session_id])
      ]);

      res.json({
        success: true,
        data: {
          today: {
            amount: parseFloat(todayCollection.rows[0]?.amount || 0),
            count: parseInt(todayCollection.rows[0]?.count || 0)
          },
          thisMonth: {
            amount: parseFloat(monthCollection.rows[0]?.amount || 0),
            count: parseInt(monthCollection.rows[0]?.count || 0)
          },
          totalSession: {
            amount: parseFloat(totalCollection.rows[0]?.amount || 0),
            count: parseInt(totalCollection.rows[0]?.count || 0)
          },
          pendingDues: {
            amount: parseFloat(pendingDues.rows[0]?.amount || 0),
            studentCount: parseInt(pendingDues.rows[0]?.student_count || 0)
          },
          recentPayments: recentPayments.rows.map(p => ({
            id: p.id,
            receiptNumber: p.receipt_number,
            paymentDate: p.payment_date,
            amount: parseFloat(p.net_amount),
            status: p.status,
            studentName: `${p.first_name} ${p.last_name}`.trim(),
            admissionNumber: p.admission_number,
            className: p.class_name ? `${p.class_name} - ${p.section_name}` : 'N/A'
          }))
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Fee overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fee overview' });
  }
};

// ==========================================
// STUDENT FEE DETAILS
// ==========================================

// Search students for fee collection
export const searchStudentsForFee = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { search, academic_session_id, class_section_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      let query = `
        SELECT 
          s.id, s.first_name, s.last_name, s.admission_number, s.phone,
          cg.display_name as class_name, sec.name as section_name,
          cs.id as class_section_id
        FROM students s
        LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        WHERE s.school_id = $1 AND s.academic_session_id = $2 AND LOWER(s.status) = 'active'
      `;
      const params = [schoolId, academic_session_id];
      
      if (search) {
        params.push(`%${search.toLowerCase()}%`);
        query += ` AND (
          LOWER(s.first_name) LIKE $${params.length} 
          OR LOWER(s.last_name) LIKE $${params.length}
          OR LOWER(s.admission_number) LIKE $${params.length}
          OR s.phone LIKE $${params.length}
        )`;
      }
      
      if (class_section_id) {
        params.push(class_section_id);
        query += ` AND cs.id = $${params.length}`;
      }
      
      query += ` ORDER BY s.first_name, s.last_name LIMIT 50`;
      
      const result = await dbClient.query(query, params);
      
      res.json({
        success: true,
        data: result.rows.map(s => ({
          id: s.id,
          name: `${s.first_name} ${s.last_name}`.trim(),
          admissionNumber: s.admission_number,
          phone: s.phone,
          className: s.class_name ? `${s.class_name} - ${s.section_name}` : 'Not assigned',
          classSectionId: s.class_section_id
        }))
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Search students error:', error);
    res.status(500).json({ success: false, message: 'Failed to search students' });
  }
};

// Get student fee details (dues and history) with period-based structure
export const getStudentFeeDetails = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { studentId } = req.params;
    const { academic_session_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      // Get student info with additional details including payment_frequency
      const studentResult = await dbClient.query(`
        SELECT 
          s.id, s.first_name, s.last_name, s.admission_number, s.phone,
          s.father_name, s.mother_name, s.roll_number, s.date_of_birth,
          s.gender, s.address, s.email, s.admission_date,
          s.payment_frequency as student_payment_frequency,
          s.custom_fee_structure_id,
          cg.display_name as class_name, sec.name as section_name,
          cg.id as class_grade_id, cs.id as class_section_id
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
      
      // Get fee settings for the student's class or school default
      let feeSettingsResult = await dbClient.query(`
        SELECT * FROM class_fee_settings 
        WHERE school_id = $1 AND academic_session_id = $2 AND class_grade_id = $3
      `, [schoolId, academic_session_id, student.class_grade_id]);
      
      if (feeSettingsResult.rows.length === 0) {
        feeSettingsResult = await dbClient.query(`
          SELECT * FROM fee_settings 
          WHERE school_id = $1 AND academic_session_id = $2
        `, [schoolId, academic_session_id]);
      }
      
      // Use student's custom payment frequency if set, otherwise use class/school default
      const baseFeeSettings = feeSettingsResult.rows[0] || {
        payment_frequency: 'monthly',
        due_day_of_month: 10,
        grace_period_days: 5,
        late_fee_enabled: false,
        late_fee_type: 'fixed',
        late_fee_amount: 0,
        partial_payment_allowed: true
      };
      
      // Override with student's payment frequency if set
      const feeSettings = {
        ...baseFeeSettings,
        payment_frequency: student.student_payment_frequency || baseFeeSettings.payment_frequency
      };
      
      // Get fee calendar/periods ONLY for student's payment frequency
      const paymentFrequency = feeSettings.payment_frequency || 'monthly';
      const feeCalendarResult = await dbClient.query(`
        SELECT 
          fc.id, fc.period_name, fc.period_type, fc.period_start, fc.period_end,
          fc.due_date, fc.last_date_without_fine, fc.is_active
        FROM fee_calendar fc
        WHERE fc.school_id = $1 AND fc.academic_session_id = $2
          AND (fc.class_grade_id = $3 OR fc.class_grade_id IS NULL)
          AND fc.period_type = $4
          AND fc.is_active = true
        ORDER BY fc.period_start
      `, [schoolId, academic_session_id, student.class_grade_id, paymentFrequency]);
      
      const feePeriods = feeCalendarResult.rows;
      
      // Get pending dues from student_fee_dues table
      const duesResult = await dbClient.query(`
        SELECT 
          sfd.id, sfd.due_month, sfd.due_date, sfd.amount, sfd.paid_amount,
          sfd.discount_amount, sfd.fine_amount, sfd.balance, sfd.status,
          ft.id as fee_type_id, ft.name as fee_type_name, ft.category, ft.frequency
        FROM student_fee_dues sfd
        JOIN fee_types ft ON sfd.fee_type_id = ft.id
        WHERE sfd.student_id = $1 AND sfd.academic_session_id = $2
          AND sfd.status IN ('pending', 'partial')
        ORDER BY sfd.due_date, ft.name
      `, [studentId, academic_session_id]);
      
      // Get ALL fees already paid by this student with period details
      const paidFeesResult = await dbClient.query(`
        SELECT 
          fpi.fee_type_id,
          fpi.fee_month,
          fpi.amount,
          fpi.discount_amount,
          fpi.fine_amount,
          fpi.net_amount,
          fp.payment_date,
          fp.receipt_number,
          ft.frequency,
          ft.name as fee_type_name
        FROM fee_payment_items fpi
        JOIN fee_payments fp ON fpi.payment_id = fp.id
        JOIN fee_types ft ON fpi.fee_type_id = ft.id
        WHERE fp.student_id = $1 
          AND fp.academic_session_id = $2 
          AND fp.status = 'completed'
        ORDER BY fp.payment_date DESC
      `, [studentId, academic_session_id]);
      
      // Create detailed paid fees tracking
      const paidFeesMap = {};
      const paidPeriods = {}; // Track which periods are paid for which fee type
      
      for (const pf of paidFeesResult.rows) {
        if (!paidFeesMap[pf.fee_type_id]) {
          paidFeesMap[pf.fee_type_id] = {
            frequency: pf.frequency,
            paidMonths: {},
            totalPaid: 0,
            payments: []
          };
        }
        if (pf.fee_month) {
          const key = `${pf.fee_type_id}_${pf.fee_month}`;
          if (!paidPeriods[key]) paidPeriods[key] = 0;
          paidPeriods[key] += parseFloat(pf.amount);
          paidFeesMap[pf.fee_type_id].paidMonths[pf.fee_month] = 
            (paidFeesMap[pf.fee_type_id].paidMonths[pf.fee_month] || 0) + parseFloat(pf.amount);
        }
        paidFeesMap[pf.fee_type_id].totalPaid += parseFloat(pf.amount);
        paidFeesMap[pf.fee_type_id].payments.push({
          feeMonth: pf.fee_month,
          amount: parseFloat(pf.amount),
          paymentDate: pf.payment_date,
          receiptNumber: pf.receipt_number
        });
      }
      
      // Get applicable fee structure with period-based breakdown
      let applicableFees = [];
      let periodWiseFees = []; // For recurring fees
      
      if (student.class_grade_id) {
        const feeStructureResult = await dbClient.query(`
          SELECT 
            fs.id, fs.amount, fs.due_day,
            ft.id as fee_type_id, ft.name as fee_type_name, ft.category, ft.frequency
          FROM fee_structures fs
          JOIN fee_types ft ON fs.fee_type_id = ft.id
          WHERE fs.school_id = $1 AND fs.academic_session_id = $2
            AND fs.class_grade_id = $3 AND fs.is_active = true
          ORDER BY ft.category, ft.name
        `, [schoolId, academic_session_id, student.class_grade_id]);
        
        const today = new Date();
        
        for (const f of feeStructureResult.rows) {
          const paidInfo = paidFeesMap[f.fee_type_id];
          const feeAmount = parseFloat(f.amount);
          
          // Handle based on frequency
          if (f.frequency === 'one_time' || f.frequency === 'annual' || f.frequency === 'yearly') {
            // One-time/annual fee
            if (paidInfo && paidInfo.totalPaid >= feeAmount) {
              // Fully paid, skip
              continue;
            }
            
            const remainingAmount = paidInfo ? feeAmount - paidInfo.totalPaid : feeAmount;
            
            applicableFees.push({
              id: f.id,
              feeTypeId: f.fee_type_id,
              feeTypeName: f.fee_type_name,
              category: f.category,
              frequency: f.frequency,
              amount: remainingAmount,
              originalAmount: feeAmount,
              paidAmount: paidInfo?.totalPaid || 0,
              dueDay: f.due_day,
              isPartiallyPaid: (paidInfo?.totalPaid || 0) > 0,
              periodName: 'Annual',
              periodType: 'yearly'
            });
          } else if (f.frequency === 'monthly' || f.frequency === 'quarterly' || f.frequency === 'half_yearly') {
            // Recurring fee - show period-wise breakdown based on student's payment frequency
            for (const period of feePeriods) {
              // feePeriods is already filtered to student's payment frequency
              const periodKey = `${f.fee_type_id}_${period.period_name}`;
              const paidForPeriod = paidPeriods[periodKey] || 0;
              
              // Adjust fee amount based on period type vs fee frequency
              // If fee is monthly but student pays quarterly/half-yearly/yearly, multiply accordingly
              let periodFeeAmount = feeAmount;
              const studentFreq = paymentFrequency;
              if (f.frequency === 'monthly') {
                if (studentFreq === 'quarterly') {
                  periodFeeAmount = feeAmount * 3;
                } else if (studentFreq === 'half_yearly') {
                  periodFeeAmount = feeAmount * 6;
                } else if (studentFreq === 'yearly') {
                  periodFeeAmount = feeAmount * 12;
                }
                // else monthly stays as is
              }
              
              if (paidForPeriod >= periodFeeAmount) {
                // Period fully paid, skip
                continue;
              }
              
              const remainingAmount = periodFeeAmount - paidForPeriod;
              const periodEnd = new Date(period.period_end);
              const dueDate = new Date(period.due_date);
              const isOverdue = today > dueDate;
              const isPastPeriod = today > periodEnd;
              
              // Calculate late fee if applicable
              let lateFee = 0;
              if (isOverdue && feeSettings.late_fee_enabled) {
                const gracePeriod = feeSettings.grace_period_days || 0;
                const graceEndDate = new Date(dueDate);
                graceEndDate.setDate(graceEndDate.getDate() + gracePeriod);
                
                if (today > graceEndDate) {
                  if (feeSettings.late_fee_type === 'fixed') {
                    lateFee = parseFloat(feeSettings.late_fee_amount) || 0;
                  } else if (feeSettings.late_fee_type === 'percentage') {
                    lateFee = (remainingAmount * (parseFloat(feeSettings.late_fee_amount) || 0)) / 100;
                  } else if (feeSettings.late_fee_type === 'daily') {
                    const daysLate = Math.floor((today - graceEndDate) / (1000 * 60 * 60 * 24));
                    lateFee = daysLate * (parseFloat(feeSettings.late_fee_amount) || 0);
                  }
                  // Apply max cap if set
                  if (feeSettings.late_fee_max_amount && lateFee > parseFloat(feeSettings.late_fee_max_amount)) {
                    lateFee = parseFloat(feeSettings.late_fee_max_amount);
                  }
                }
              }
              
              periodWiseFees.push({
                id: `${f.id}_${period.id}`,
                feeTypeId: f.fee_type_id,
                feeTypeName: f.fee_type_name,
                category: f.category,
                frequency: f.frequency,
                amount: remainingAmount,
                originalAmount: periodFeeAmount,
                paidAmount: paidForPeriod,
                lateFee,
                dueDate: period.due_date,
                dueDay: f.due_day,
                isPartiallyPaid: paidForPeriod > 0,
                isOverdue,
                isPastPeriod,
                periodId: period.id,
                periodName: period.period_name,
                periodType: period.period_type,
                periodStart: period.period_start,
                periodEnd: period.period_end
              });
            }
          }
        }
      }
      
      // Get payment history
      const historyResult = await dbClient.query(`
        SELECT 
          fp.id, fp.receipt_number, fp.payment_date, fp.total_amount,
          fp.discount_amount, fp.fine_amount, fp.net_amount, fp.status,
          fp.payment_mode, fp.remarks
        FROM fee_payments fp
        WHERE fp.student_id = $1 AND fp.academic_session_id = $2
        ORDER BY fp.payment_date DESC, fp.created_at DESC
        LIMIT 20
      `, [studentId, academic_session_id]);
      
      // Get paid fees summary (for display)
      const paidFeesSummary = await dbClient.query(`
        SELECT 
          ft.id as fee_type_id, ft.name as fee_type_name, ft.category,
          fpi.fee_month,
          COALESCE(SUM(fpi.amount), 0) as total_paid,
          MAX(fp.payment_date) as last_paid_date,
          MAX(fp.receipt_number) as last_receipt
        FROM fee_payment_items fpi
        JOIN fee_payments fp ON fpi.payment_id = fp.id
        JOIN fee_types ft ON fpi.fee_type_id = ft.id
        WHERE fp.student_id = $1 
          AND fp.academic_session_id = $2 
          AND fp.status = 'completed'
        GROUP BY ft.id, ft.name, ft.category, fpi.fee_month
        ORDER BY ft.name, fpi.fee_month
      `, [studentId, academic_session_id]);
      
      // Organize fees into overdue, currentDue, and upcoming
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const currentMonth = today.getMonth() + 1; // 1-12
      const currentYear = today.getFullYear();
      
      // Categorize dues from student_fee_dues
      const overdue = [];
      const currentDue = [];
      const upcoming = [];
      const paid = [];
      
      // Process dues from the dues table
      for (const d of duesResult.rows) {
        const dueDate = new Date(d.due_date);
        dueDate.setHours(0, 0, 0, 0);
        
        // Calculate late fee if overdue
        let lateFee = 0;
        const isOverdue = today > dueDate;
        
        if (isOverdue && feeSettings.late_fee_enabled) {
          const gracePeriod = feeSettings.grace_period_days || 0;
          const graceEndDate = new Date(dueDate);
          graceEndDate.setDate(graceEndDate.getDate() + gracePeriod);
          
          if (today > graceEndDate) {
            if (feeSettings.late_fee_type === 'fixed') {
              lateFee = parseFloat(feeSettings.late_fee_amount) || 0;
            } else if (feeSettings.late_fee_type === 'percentage') {
              lateFee = (parseFloat(d.balance) * (parseFloat(feeSettings.late_fee_amount) || 0)) / 100;
            } else if (feeSettings.late_fee_type === 'daily') {
              const daysLate = Math.floor((today - graceEndDate) / (1000 * 60 * 60 * 24));
              lateFee = daysLate * (parseFloat(feeSettings.late_fee_amount) || 0);
            }
            if (feeSettings.late_fee_max_amount && lateFee > parseFloat(feeSettings.late_fee_max_amount)) {
              lateFee = parseFloat(feeSettings.late_fee_max_amount);
            }
          }
        }
        
        const feeItem = {
          id: d.id,
          feeTypeId: d.fee_type_id,
          feeTypeName: d.fee_type_name,
          category: d.category,
          frequency: d.frequency,
          dueMonth: d.due_month,
          dueDate: d.due_date,
          amount: parseFloat(d.balance),
          originalAmount: parseFloat(d.amount),
          paidAmount: parseFloat(d.paid_amount),
          lateFee,
          isOverdue,
          periodName: d.due_month,
          periodType: d.frequency
        };
        
        if (isOverdue) {
          overdue.push(feeItem);
        } else {
          // Check if it's current month
          const dueMonth = dueDate.getMonth() + 1;
          const dueYear = dueDate.getFullYear();
          if (dueMonth === currentMonth && dueYear === currentYear) {
            currentDue.push(feeItem);
          } else if (dueDate > today) {
            upcoming.push(feeItem);
          }
        }
      }
      
      // Also process period-wise fees that don't have dues yet
      for (const f of periodWiseFees) {
        if (f.isOverdue) {
          overdue.push(f);
        } else {
          const dueDate = new Date(f.dueDate);
          const dueMonth = dueDate.getMonth() + 1;
          const dueYear = dueDate.getFullYear();
          if (dueMonth === currentMonth && dueYear === currentYear) {
            currentDue.push(f);
          } else {
            upcoming.push(f);
          }
        }
      }
      
      // Add annual/one-time fees to current (if not paid)
      for (const f of applicableFees) {
        currentDue.push(f);
      }
      
      // Process paid fees
      for (const pf of paidFeesSummary.rows) {
        paid.push({
          feeTypeId: pf.fee_type_id,
          feeTypeName: pf.fee_type_name,
          category: pf.category,
          periodName: pf.fee_month,
          paidAmount: parseFloat(pf.total_paid),
          lastPaidDate: pf.last_paid_date,
          lastReceipt: pf.last_receipt
        });
      }
      
      // Sort by date
      overdue.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
      currentDue.sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
      upcoming.sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0));
      
      // Calculate totals
      const totalOverdue = overdue.reduce((sum, f) => sum + f.amount + (f.lateFee || 0), 0);
      const totalCurrentDue = currentDue.reduce((sum, f) => sum + f.amount, 0);
      const totalUpcoming = upcoming.reduce((sum, f) => sum + f.amount, 0);
      const totalLateFees = overdue.reduce((sum, f) => sum + (f.lateFee || 0), 0);
      const totalPaid = historyResult.rows
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + parseFloat(p.net_amount), 0);
      
      res.json({
        success: true,
        data: {
          student: {
            id: student.id,
            name: `${student.first_name} ${student.last_name}`.trim(),
            firstName: student.first_name,
            lastName: student.last_name,
            admissionNumber: student.admission_number,
            phone: student.phone,
            email: student.email,
            fatherName: student.father_name,
            motherName: student.mother_name,
            rollNumber: student.roll_number,
            dateOfBirth: student.date_of_birth,
            gender: student.gender,
            address: student.address,
            admissionDate: student.admission_date,
            className: student.class_name ? `${student.class_name} - ${student.section_name}` : 'Not assigned',
            classGradeId: student.class_grade_id,
            classSectionId: student.class_section_id,
            // Fee settings
            paymentFrequency: feeSettings.payment_frequency,
            paymentFrequencySource: student.student_payment_frequency ? 'student' : 
              (feeSettingsResult.rows[0]?.class_grade_id ? 'class' : 'school'),
            hasCustomPaymentFrequency: !!student.student_payment_frequency
          },
          feeSettings: {
            paymentFrequency: feeSettings.payment_frequency,
            dueDayOfMonth: feeSettings.due_day_of_month,
            gracePeriodDays: feeSettings.grace_period_days,
            lateFeeEnabled: feeSettings.late_fee_enabled,
            lateFeeType: feeSettings.late_fee_type,
            lateFeeAmount: parseFloat(feeSettings.late_fee_amount) || 0,
            partialPaymentAllowed: feeSettings.partial_payment_allowed
          },
          feePeriods: feePeriods.map(p => ({
            id: p.id,
            name: p.period_name,
            type: p.period_type,
            startDate: p.period_start,
            endDate: p.period_end,
            dueDate: p.due_date,
            lastDateWithoutFine: p.last_date_without_fine
          })),
          summary: {
            totalOverdue,
            totalCurrentDue,
            totalUpcoming,
            totalLateFees,
            totalPaid,
            grandTotal: totalOverdue + totalCurrentDue
          },
          // New categorized structure
          overdue,
          currentDue,
          upcoming,
          paid,
          // Legacy support
          pendingDues: duesResult.rows.map(d => ({
            id: d.id,
            feeTypeId: d.fee_type_id,
            feeTypeName: d.fee_type_name,
            category: d.category,
            frequency: d.frequency,
            dueMonth: d.due_month,
            dueDate: d.due_date,
            amount: parseFloat(d.amount),
            paidAmount: parseFloat(d.paid_amount),
            discountAmount: parseFloat(d.discount_amount),
            fineAmount: parseFloat(d.fine_amount),
            balance: parseFloat(d.balance),
            status: d.status
          })),
          applicableFees,
          periodWiseFees,
          paidFees: paidFeesSummary.rows.map(pf => ({
            feeTypeId: pf.fee_type_id,
            feeTypeName: pf.fee_type_name,
            category: pf.category,
            periodName: pf.fee_month,
            totalPaid: parseFloat(pf.total_paid),
            lastPaidDate: pf.last_paid_date,
            lastReceipt: pf.last_receipt
          })),
          paymentHistory: historyResult.rows.map(p => ({
            id: p.id,
            receiptNumber: p.receipt_number,
            paymentDate: p.payment_date,
            totalAmount: parseFloat(p.total_amount),
            discountAmount: parseFloat(p.discount_amount),
            fineAmount: parseFloat(p.fine_amount),
            netAmount: parseFloat(p.net_amount),
            status: p.status,
            paymentMode: p.payment_mode,
            remarks: p.remarks
          }))
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get student fee details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch student fee details' });
  }
};

// ==========================================
// FEE COLLECTION
// ==========================================

// Generate next receipt number
const getNextReceiptNumber = async (dbClient, schoolId, sessionId) => {
  // Try to get existing sequence
  let seqResult = await dbClient.query(`
    SELECT id, prefix, current_number FROM receipt_sequences
    WHERE school_id = $1 AND academic_session_id = $2
  `, [schoolId, sessionId]);
  
  if (seqResult.rows.length === 0) {
    // Create new sequence
    seqResult = await dbClient.query(`
      INSERT INTO receipt_sequences (school_id, academic_session_id, prefix, current_number)
      VALUES ($1, $2, 'RCP', 0)
      RETURNING id, prefix, current_number
    `, [schoolId, sessionId]);
  }
  
  const seq = seqResult.rows[0];
  const nextNumber = seq.current_number + 1;
  
  // Update sequence
  await dbClient.query(`
    UPDATE receipt_sequences SET current_number = $1, updated_at = NOW()
    WHERE id = $2
  `, [nextNumber, seq.id]);
  
  // Get session year for receipt
  const sessionResult = await dbClient.query(`
    SELECT EXTRACT(YEAR FROM start_date) as year FROM academic_sessions WHERE id = $1
  `, [sessionId]);
  const year = sessionResult.rows[0]?.year || new Date().getFullYear();
  
  return `${seq.prefix}/${year}/${String(nextNumber).padStart(5, '0')}`;
};

// Collect fee payment with comprehensive validations
export const collectFee = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const userId = req.user.id;
    const {
      student_id,
      academic_session_id,
      fee_items, // Array of { fee_type_id, amount, discount_amount, fine_amount, period_name, period_id }
      total_amount,
      discount_amount,
      fine_amount,
      net_amount,
      remarks
    } = req.body;
    
    // Basic validation
    if (!student_id) {
      return res.status(400).json({ success: false, message: 'Student is required' });
    }
    if (!fee_items || fee_items.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least one fee to collect' });
    }
    if (!academic_session_id) {
      return res.status(400).json({ success: false, message: 'Academic session is required' });
    }
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      // Validate student exists and is active
      const studentCheck = await dbClient.query(`
        SELECT id, first_name, last_name, status FROM students 
        WHERE id = $1 AND school_id = $2
      `, [student_id, schoolId]);
      
      if (studentCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      
      if (studentCheck.rows[0].status?.toLowerCase() !== 'active') {
        return res.status(400).json({ 
          success: false, 
          message: `Cannot collect fees for inactive student (Status: ${studentCheck.rows[0].status})` 
        });
      }
      
      // Validate each fee item
      const validationErrors = [];
      const duplicateCheck = new Set();
      
      for (let i = 0; i < fee_items.length; i++) {
        const item = fee_items[i];
        
        // Check for required fields
        if (!item.fee_type_id) {
          validationErrors.push(`Item ${i + 1}: Fee type is required`);
          continue;
        }
        
        if (!item.amount || parseFloat(item.amount) <= 0) {
          validationErrors.push(`Item ${i + 1}: Amount must be greater than 0`);
        }
        
        // Check for duplicates in current submission
        const itemKey = `${item.fee_type_id}_${item.period_name || 'annual'}`;
        if (duplicateCheck.has(itemKey)) {
          validationErrors.push(`Duplicate fee: ${item.fee_type_name || 'Unknown'} for ${item.period_name || 'Annual'}`);
        }
        duplicateCheck.add(itemKey);
        
        // Validate fee type exists
        const feeTypeCheck = await dbClient.query(`
          SELECT id, name, frequency FROM fee_types WHERE id = $1 AND school_id = $2
        `, [item.fee_type_id, schoolId]);
        
        if (feeTypeCheck.rows.length === 0) {
          validationErrors.push(`Item ${i + 1}: Invalid fee type`);
          continue;
        }
        
        // Check for duplicate payment (already paid for this period)
        const existingPayment = await dbClient.query(`
          SELECT fpi.id, fp.receipt_number, fp.payment_date, fpi.amount
          FROM fee_payment_items fpi
          JOIN fee_payments fp ON fpi.payment_id = fp.id
          WHERE fp.student_id = $1 
            AND fp.academic_session_id = $2 
            AND fpi.fee_type_id = $3
            AND fpi.fee_month = $4
            AND fp.status = 'completed'
        `, [student_id, academic_session_id, item.fee_type_id, item.period_name]);
        
        if (existingPayment.rows.length > 0) {
          const existing = existingPayment.rows[0];
          const feeTypeName = feeTypeCheck.rows[0].name;
          const frequency = feeTypeCheck.rows[0].frequency;
          
          // For recurring fees, check if already fully paid for this period
          if (frequency === 'monthly' || frequency === 'quarterly' || frequency === 'half_yearly') {
            const totalPaidForPeriod = existingPayment.rows.reduce((sum, p) => sum + parseFloat(p.amount), 0);
            
            // Get fee structure amount for validation
            const feeStructure = await dbClient.query(`
              SELECT fs.amount FROM fee_structures fs
              JOIN class_sections cs ON cs.class_grade_id = fs.class_grade_id
              JOIN students s ON s.current_class_section_id = cs.id
              WHERE s.id = $1 AND fs.fee_type_id = $2 AND fs.academic_session_id = $3
            `, [student_id, item.fee_type_id, academic_session_id]);
            
            if (feeStructure.rows.length > 0) {
              const requiredAmount = parseFloat(feeStructure.rows[0].amount);
              if (totalPaidForPeriod >= requiredAmount) {
                validationErrors.push(
                  `"${feeTypeName}" for "${item.period_name}" is already fully paid (Receipt: ${existing.receipt_number})`
                );
              }
            }
          } else if (frequency === 'one_time' || frequency === 'annual' || frequency === 'yearly') {
            // For one-time/annual, check total paid across all periods
            const totalPaid = await dbClient.query(`
              SELECT COALESCE(SUM(fpi.amount), 0) as total
              FROM fee_payment_items fpi
              JOIN fee_payments fp ON fpi.payment_id = fp.id
              WHERE fp.student_id = $1 
                AND fp.academic_session_id = $2 
                AND fpi.fee_type_id = $3
                AND fp.status = 'completed'
            `, [student_id, academic_session_id, item.fee_type_id]);
            
            const feeStructure = await dbClient.query(`
              SELECT fs.amount FROM fee_structures fs
              JOIN class_sections cs ON cs.class_grade_id = fs.class_grade_id
              JOIN students s ON s.current_class_section_id = cs.id
              WHERE s.id = $1 AND fs.fee_type_id = $2 AND fs.academic_session_id = $3
            `, [student_id, item.fee_type_id, academic_session_id]);
            
            if (feeStructure.rows.length > 0) {
              const requiredAmount = parseFloat(feeStructure.rows[0].amount);
              const paidAmount = parseFloat(totalPaid.rows[0].total);
              if (paidAmount >= requiredAmount) {
                validationErrors.push(
                  `"${feeTypeName}" is already fully paid for this session`
                );
              }
            }
          }
        }
      }
      
      if (validationErrors.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: validationErrors
        });
      }
      
      await dbClient.query('BEGIN');
      
      // Generate receipt number
      const receiptNumber = await getNextReceiptNumber(dbClient, schoolId, academic_session_id);
      
      // Create payment record
      const paymentResult = await dbClient.query(`
        INSERT INTO fee_payments (
          school_id, student_id, academic_session_id, receipt_number,
          payment_date, payment_mode, total_amount, discount_amount,
          fine_amount, net_amount, remarks, collected_by, status
        ) VALUES ($1, $2, $3, $4, CURRENT_DATE, 'cash', $5, $6, $7, $8, $9, $10, 'completed')
        RETURNING *
      `, [
        schoolId, student_id, academic_session_id, receiptNumber,
        total_amount, discount_amount || 0, fine_amount || 0, net_amount,
        remarks, userId
      ]);
      
      const payment = paymentResult.rows[0];
      
      // Create payment items and update dues
      for (const item of fee_items) {
        const itemNet = (parseFloat(item.amount) || 0) - (parseFloat(item.discount_amount) || 0) + (parseFloat(item.fine_amount) || 0);
        
        // Use period_name for fee_month
        const feeMonth = item.period_name || item.due_month || null;
        
        await dbClient.query(`
          INSERT INTO fee_payment_items (
            payment_id, fee_type_id, amount, discount_amount, fine_amount, net_amount, fee_month
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          payment.id, item.fee_type_id, item.amount,
          item.discount_amount || 0, item.fine_amount || 0, itemNet, feeMonth
        ]);
        
        // Update or create student fee dues
        const existingDue = await dbClient.query(`
          SELECT id, paid_amount, balance, amount FROM student_fee_dues
          WHERE student_id = $1 AND fee_type_id = $2 AND academic_session_id = $3
            AND (due_month = $4 OR ($4 IS NULL AND due_month IS NULL))
        `, [student_id, item.fee_type_id, academic_session_id, feeMonth]);
        
        if (existingDue.rows.length > 0) {
          // Update existing due
          const due = existingDue.rows[0];
          const newPaid = parseFloat(due.paid_amount) + itemNet;
          const newBalance = parseFloat(due.balance) - itemNet;
          const newStatus = newBalance <= 0 ? 'paid' : 'partial';
          
          await dbClient.query(`
            UPDATE student_fee_dues
            SET paid_amount = $1, balance = $2, status = $3, updated_at = NOW()
            WHERE id = $4
          `, [newPaid, Math.max(0, newBalance), newStatus, due.id]);
        } else {
          // Create new due record as paid
          await dbClient.query(`
            INSERT INTO student_fee_dues (
              school_id, student_id, academic_session_id, fee_type_id,
              due_month, amount, paid_amount, balance, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'paid')
          `, [
            schoolId, student_id, academic_session_id, item.fee_type_id,
            feeMonth, item.amount, itemNet
          ]);
        }
      }
      
      await dbClient.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Payment collected successfully',
        data: {
          paymentId: payment.id,
          receiptNumber: payment.receipt_number,
          amount: parseFloat(payment.net_amount),
          paymentDate: payment.payment_date
        }
      });
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Collect fee error:', error);
    res.status(500).json({ success: false, message: 'Failed to collect fee' });
  }
};

// Get payment receipt details
export const getReceiptDetails = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { paymentId } = req.params;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      // Get payment with student details
      const paymentResult = await dbClient.query(`
        SELECT 
          fp.*,
          s.first_name, s.last_name, s.admission_number, s.phone,
          s.father_name, s.mother_name, s.address, s.roll_number,
          cg.display_name as class_name, sec.name as section_name,
          acs.name as session_name,
          sa.name as collected_by_name
        FROM fee_payments fp
        JOIN students s ON fp.student_id = s.id
        LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        LEFT JOIN academic_sessions acs ON fp.academic_session_id = acs.id
        LEFT JOIN school_admins sa ON fp.collected_by = sa.id
        WHERE fp.id = $1 AND fp.school_id = $2
      `, [paymentId, schoolId]);
      
      if (paymentResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }
      
      const payment = paymentResult.rows[0];
      
      // Get payment items
      const itemsResult = await dbClient.query(`
        SELECT 
          fpi.*, ft.name as fee_type_name, ft.category
        FROM fee_payment_items fpi
        JOIN fee_types ft ON fpi.fee_type_id = ft.id
        WHERE fpi.payment_id = $1
      `, [paymentId]);
      
      // Get school info
      const schoolResult = await dbClient.query(`
        SELECT school_name, address_line1, address_line2, city, state, pincode,
               primary_contact_phone, primary_contact_email, logo_url 
        FROM schools WHERE id = $1
      `, [schoolId]);
      
      const school = schoolResult.rows[0];
      const fullAddress = school ? [
        school.address_line1,
        school.address_line2,
        school.city,
        school.state,
        school.pincode
      ].filter(Boolean).join(', ') : '';
      
      res.json({
        success: true,
        data: {
          school: school ? {
            name: school.school_name,
            address: fullAddress,
            phone: school.primary_contact_phone,
            email: school.primary_contact_email,
            logoUrl: school.logo_url
          } : null,
          payment: {
            id: payment.id,
            receiptNumber: payment.receipt_number,
            paymentDate: payment.payment_date,
            paymentMode: payment.payment_mode,
            totalAmount: parseFloat(payment.total_amount),
            discountAmount: parseFloat(payment.discount_amount),
            fineAmount: parseFloat(payment.fine_amount),
            netAmount: parseFloat(payment.net_amount),
            status: payment.status,
            remarks: payment.remarks,
            collectedBy: payment.collected_by_name,
            sessionName: payment.session_name
          },
          student: {
            name: `${payment.first_name} ${payment.last_name}`.trim(),
            admissionNumber: payment.admission_number,
            phone: payment.phone,
            fatherName: payment.father_name,
            motherName: payment.mother_name,
            address: payment.address,
            rollNumber: payment.roll_number,
            className: payment.class_name ? `${payment.class_name} - ${payment.section_name}` : 'N/A'
          },
          items: itemsResult.rows.map(item => ({
            feeTypeName: item.fee_type_name,
            category: item.category,
            feeMonth: item.fee_month,
            amount: parseFloat(item.amount),
            discountAmount: parseFloat(item.discount_amount),
            fineAmount: parseFloat(item.fine_amount),
            netAmount: parseFloat(item.net_amount)
          }))
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get receipt details error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch receipt details' });
  }
};

// ==========================================
// REPORTS
// ==========================================

// Collection report (daily/date range)
export const getCollectionReport = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, from_date, to_date, class_section_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      let query = `
        SELECT 
          fp.id, fp.receipt_number, fp.payment_date, fp.net_amount, fp.status, fp.payment_mode,
          s.first_name, s.last_name, s.admission_number,
          cg.display_name as class_name, sec.name as section_name
        FROM fee_payments fp
        JOIN students s ON fp.student_id = s.id
        LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        WHERE fp.school_id = $1 AND fp.academic_session_id = $2 AND fp.status = 'completed'
      `;
      const params = [schoolId, academic_session_id];
      
      if (from_date) {
        params.push(from_date);
        query += ` AND fp.payment_date >= $${params.length}`;
      }
      
      if (to_date) {
        params.push(to_date);
        query += ` AND fp.payment_date <= $${params.length}`;
      }
      
      if (class_section_id) {
        params.push(class_section_id);
        query += ` AND cs.id = $${params.length}`;
      }
      
      query += ` ORDER BY fp.payment_date DESC, fp.created_at DESC`;
      
      const result = await dbClient.query(query, params);
      
      // Calculate totals
      const totalAmount = result.rows.reduce((sum, r) => sum + parseFloat(r.net_amount), 0);
      
      res.json({
        success: true,
        data: {
          summary: {
            totalPayments: result.rows.length,
            totalAmount
          },
          payments: result.rows.map(p => ({
            id: p.id,
            receiptNumber: p.receipt_number,
            paymentDate: p.payment_date,
            amount: parseFloat(p.net_amount),
            paymentMode: p.payment_mode,
            studentName: `${p.first_name} ${p.last_name}`.trim(),
            admissionNumber: p.admission_number,
            className: p.class_name ? `${p.class_name} - ${p.section_name}` : 'N/A'
          }))
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Collection report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate collection report' });
  }
};

// Pending dues report (class-wise)
export const getPendingDuesReport = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, class_section_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      let query = `
        SELECT 
          s.id as student_id, s.first_name, s.last_name, s.admission_number, s.phone,
          cg.display_name as class_name, sec.name as section_name,
          COALESCE(SUM(sfd.balance), 0) as total_due,
          COUNT(DISTINCT sfd.fee_type_id) as pending_fee_types
        FROM students s
        LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        LEFT JOIN sections sec ON cs.section_id = sec.id
        LEFT JOIN student_fee_dues sfd ON s.id = sfd.student_id 
          AND sfd.academic_session_id = $2 AND sfd.status IN ('pending', 'partial')
        WHERE s.school_id = $1 AND s.academic_session_id = $2 AND LOWER(s.status) = 'active'
      `;
      const params = [schoolId, academic_session_id];
      
      if (class_section_id) {
        params.push(class_section_id);
        query += ` AND cs.id = $${params.length}`;
      }
      
      query += ` GROUP BY s.id, s.first_name, s.last_name, s.admission_number, s.phone, cg.display_name, sec.name, cg.numeric_value
                 HAVING COALESCE(SUM(sfd.balance), 0) > 0
                 ORDER BY cg.numeric_value, sec.name, s.first_name`;
      
      const result = await dbClient.query(query, params);
      
      // Calculate totals
      const totalDue = result.rows.reduce((sum, r) => sum + parseFloat(r.total_due), 0);
      
      res.json({
        success: true,
        data: {
          summary: {
            totalStudents: result.rows.length,
            totalDueAmount: totalDue
          },
          students: result.rows.map(s => ({
            studentId: s.student_id,
            name: `${s.first_name} ${s.last_name}`.trim(),
            admissionNumber: s.admission_number,
            phone: s.phone,
            className: s.class_name ? `${s.class_name} - ${s.section_name}` : 'N/A',
            totalDue: parseFloat(s.total_due),
            pendingFeeTypes: parseInt(s.pending_fee_types)
          }))
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Pending dues report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate pending dues report' });
  }
};

// Class-wise collection summary
export const getClassWiseCollection = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      // Use a CTE to calculate pending dues per class
      const result = await dbClient.query(`
        WITH class_pending AS (
          SELECT 
            cs.class_grade_id,
            COALESCE(SUM(sfd.balance), 0) as pending_amount
          FROM student_fee_dues sfd
          JOIN students s ON sfd.student_id = s.id
          JOIN class_sections cs ON s.current_class_section_id = cs.id
          WHERE sfd.school_id = $1 
            AND sfd.academic_session_id = $2
            AND sfd.status IN ('pending', 'partial')
          GROUP BY cs.class_grade_id
        ),
        class_collection AS (
          SELECT 
            cs.class_grade_id,
            COALESCE(SUM(fp.net_amount), 0) as collected_amount
          FROM fee_payments fp
          JOIN students s ON fp.student_id = s.id
          JOIN class_sections cs ON s.current_class_section_id = cs.id
          WHERE fp.school_id = $1 
            AND fp.academic_session_id = $2
            AND fp.status = 'completed'
          GROUP BY cs.class_grade_id
        )
        SELECT 
          cg.display_name as class_name,
          cg.numeric_value,
          COUNT(DISTINCT s.id) as total_students,
          COALESCE(cc.collected_amount, 0) as collected_amount,
          COALESCE(cp.pending_amount, 0) as pending_amount
        FROM class_grades cg
        LEFT JOIN class_sections cs ON cg.id = cs.class_grade_id AND cs.academic_session_id = $2
        LEFT JOIN students s ON cs.id = s.current_class_section_id AND s.academic_session_id = $2
        LEFT JOIN class_collection cc ON cg.id = cc.class_grade_id
        LEFT JOIN class_pending cp ON cg.id = cp.class_grade_id
        WHERE cg.school_id = $1
        GROUP BY cg.id, cg.display_name, cg.numeric_value, cc.collected_amount, cp.pending_amount
        ORDER BY cg.numeric_value
      `, [schoolId, academic_session_id]);
      
      const totals = result.rows.reduce((acc, r) => ({
        students: acc.students + parseInt(r.total_students || 0),
        collected: acc.collected + parseFloat(r.collected_amount || 0),
        pending: acc.pending + parseFloat(r.pending_amount || 0)
      }), { students: 0, collected: 0, pending: 0 });
      
      res.json({
        success: true,
        data: {
          summary: {
            totalStudents: totals.students,
            totalCollected: totals.collected,
            totalPending: totals.pending
          },
          classes: result.rows.map(c => ({
            className: c.class_name,
            totalStudents: parseInt(c.total_students || 0),
            collectedAmount: parseFloat(c.collected_amount || 0),
            pendingAmount: parseFloat(c.pending_amount || 0)
          }))
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Class-wise collection error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate class-wise collection report' });
  }
};

// Fee type wise collection
export const getFeeTypeWiseCollection = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      const result = await dbClient.query(`
        SELECT 
          ft.id, ft.name, ft.category, ft.frequency,
          COALESCE(SUM(fpi.net_amount), 0) as collected_amount,
          COUNT(DISTINCT fpi.payment_id) as payment_count
        FROM fee_types ft
        LEFT JOIN fee_payment_items fpi ON ft.id = fpi.fee_type_id
        LEFT JOIN fee_payments fp ON fpi.payment_id = fp.id 
          AND fp.academic_session_id = $2 AND fp.status = 'completed'
        WHERE ft.school_id = $1 AND ft.is_active = true
        GROUP BY ft.id, ft.name, ft.category, ft.frequency
        ORDER BY ft.category, ft.name
      `, [schoolId, academic_session_id]);
      
      const total = result.rows.reduce((sum, r) => sum + parseFloat(r.collected_amount || 0), 0);
      
      res.json({
        success: true,
        data: {
          summary: { totalCollection: total },
          feeTypes: result.rows.map(f => ({
            id: f.id,
            name: f.name,
            category: f.category,
            frequency: f.frequency,
            collectedAmount: parseFloat(f.collected_amount || 0),
            paymentCount: parseInt(f.payment_count || 0)
          }))
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Fee type wise collection error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate fee type wise report' });
  }
};

// Cancel payment
export const cancelPayment = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const userId = req.user.id;
    const { paymentId } = req.params;
    const { reason } = req.body;
    
    if (!reason) {
      return res.status(400).json({ success: false, message: 'Cancellation reason is required' });
    }
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      await dbClient.query('BEGIN');
      
      // Get payment details
      const paymentResult = await dbClient.query(`
        SELECT * FROM fee_payments WHERE id = $1 AND school_id = $2 AND status = 'completed'
      `, [paymentId, schoolId]);
      
      if (paymentResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Payment not found or already cancelled' });
      }
      
      const payment = paymentResult.rows[0];
      
      // Update payment status
      await dbClient.query(`
        UPDATE fee_payments 
        SET status = 'cancelled', cancelled_by = $1, cancelled_at = NOW(), 
            cancellation_reason = $2, updated_at = NOW()
        WHERE id = $3
      `, [userId, reason, paymentId]);
      
      // Revert dues
      const itemsResult = await dbClient.query(`
        SELECT * FROM fee_payment_items WHERE payment_id = $1
      `, [paymentId]);
      
      for (const item of itemsResult.rows) {
        await dbClient.query(`
          UPDATE student_fee_dues
          SET paid_amount = paid_amount - $1, 
              balance = balance + $1,
              status = CASE WHEN paid_amount - $1 <= 0 THEN 'pending' ELSE 'partial' END,
              updated_at = NOW()
          WHERE student_id = $2 AND fee_type_id = $3 AND academic_session_id = $4
            AND (due_month = $5 OR due_month IS NULL)
        `, [parseFloat(item.net_amount), payment.student_id, item.fee_type_id, payment.academic_session_id, item.fee_month]);
      }
      
      await dbClient.query('COMMIT');
      
      res.json({ success: true, message: 'Payment cancelled successfully' });
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Cancel payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel payment' });
  }
};

// Generate fee dues for students
export const generateFeeDues = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, class_section_id, fee_month } = req.body;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      await dbClient.query('BEGIN');
      
      // Get students in the class
      const studentsResult = await dbClient.query(`
        SELECT s.id, cs.class_grade_id
        FROM students s
        JOIN class_sections cs ON s.current_class_section_id = cs.id
        WHERE s.school_id = $1 AND s.academic_session_id = $2 
          AND cs.id = $3 AND LOWER(s.status) = 'active'
      `, [schoolId, academic_session_id, class_section_id]);
      
      if (studentsResult.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'No students found in this class' });
      }
      
      const classGradeId = studentsResult.rows[0].class_grade_id;
      
      // Get fee structures for this class
      const feeStructures = await dbClient.query(`
        SELECT fs.*, ft.name, ft.frequency
        FROM fee_structures fs
        JOIN fee_types ft ON fs.fee_type_id = ft.id
        WHERE fs.school_id = $1 AND fs.academic_session_id = $2 
          AND fs.class_grade_id = $3 AND fs.is_active = true
      `, [schoolId, academic_session_id, classGradeId]);
      
      let duesCreated = 0;
      
      for (const student of studentsResult.rows) {
        for (const fs of feeStructures.rows) {
          // Check if due already exists
          const existingDue = await dbClient.query(`
            SELECT id FROM student_fee_dues
            WHERE student_id = $1 AND fee_type_id = $2 AND academic_session_id = $3
              AND (due_month = $4 OR ($4 IS NULL AND due_month IS NULL))
          `, [student.id, fs.fee_type_id, academic_session_id, fee_month]);
          
          if (existingDue.rows.length === 0) {
            await dbClient.query(`
              INSERT INTO student_fee_dues (
                school_id, student_id, academic_session_id, fee_type_id, fee_structure_id,
                due_month, amount, balance, status
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, 'pending')
            `, [schoolId, student.id, academic_session_id, fs.fee_type_id, fs.id, fee_month, fs.amount]);
            duesCreated++;
          }
        }
      }
      
      await dbClient.query('COMMIT');
      
      res.json({
        success: true,
        message: `Generated ${duesCreated} fee dues for ${studentsResult.rows.length} students`
      });
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Generate fee dues error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate fee dues' });
  }
};

// Generate fee dues for a single student based on their class and admission date
export const generateStudentDues = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { student_id, academic_session_id } = req.body;
    
    if (!student_id || !academic_session_id) {
      return res.status(400).json({ success: false, message: 'Student ID and academic session are required' });
    }
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      await dbClient.query('BEGIN');
      
      // Get student details with class info
      const studentResult = await dbClient.query(`
        SELECT s.*, cg.id as class_grade_id, cg.display_name as class_name
        FROM students s
        LEFT JOIN class_sections cs ON s.current_class_section_id = cs.id
        LEFT JOIN class_grades cg ON cs.class_grade_id = cg.id
        WHERE s.id = $1 AND s.school_id = $2
      `, [student_id, schoolId]);
      
      if (studentResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Student not found' });
      }
      
      const student = studentResult.rows[0];
      
      if (!student.class_grade_id) {
        return res.status(400).json({ success: false, message: 'Student is not assigned to a class' });
      }
      
      // Get session details
      const sessionResult = await dbClient.query(`
        SELECT * FROM academic_sessions WHERE id = $1
      `, [academic_session_id]);
      
      if (sessionResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Academic session not found' });
      }
      
      const session = sessionResult.rows[0];
      const sessionStart = new Date(session.start_date);
      const sessionEnd = new Date(session.end_date);
      const admissionDate = student.admission_date ? new Date(student.admission_date) : sessionStart;
      
      // Get fee settings for the class or school default
      let feeSettingsResult = await dbClient.query(`
        SELECT * FROM class_fee_settings 
        WHERE school_id = $1 AND academic_session_id = $2 AND class_grade_id = $3
      `, [schoolId, academic_session_id, student.class_grade_id]);
      
      if (feeSettingsResult.rows.length === 0) {
        feeSettingsResult = await dbClient.query(`
          SELECT * FROM fee_settings 
          WHERE school_id = $1 AND academic_session_id = $2
        `, [schoolId, academic_session_id]);
      }
      
      const feeSettings = feeSettingsResult.rows[0] || {
        payment_frequency: 'monthly',
        due_day_of_month: 10
      };
      
      // Get fee structures for this class
      const feeStructures = await dbClient.query(`
        SELECT fs.*, ft.name as fee_type_name, ft.frequency, ft.category,
               ft.applicability_type, ft.applicable_months, ft.is_prorated_on_join
        FROM fee_structures fs
        JOIN fee_types ft ON fs.fee_type_id = ft.id
        WHERE fs.school_id = $1 AND fs.academic_session_id = $2 
          AND fs.class_grade_id = $3 AND fs.is_active = true
      `, [schoolId, academic_session_id, student.class_grade_id]);
      
      let duesCreated = 0;
      const today = new Date();
      
      for (const fs of feeStructures.rows) {
        const frequency = fs.frequency || 'monthly';
        const amount = parseFloat(fs.amount);
        const applicabilityType = fs.applicability_type || 'full_year';
        const applicableMonths = fs.applicable_months || [];
        
        // Determine which periods to generate dues for
        if (frequency === 'one_time' || frequency === 'annual' || frequency === 'yearly') {
          // One-time fee - create single due for the year
          const existingDue = await dbClient.query(`
            SELECT id FROM student_fee_dues
            WHERE student_id = $1 AND fee_type_id = $2 AND academic_session_id = $3
          `, [student_id, fs.fee_type_id, academic_session_id]);
          
          if (existingDue.rows.length === 0) {
            // Check proration
            let finalAmount = amount;
            if (fs.is_prorated_on_join && admissionDate > sessionStart) {
              const totalMonths = 12;
              const monthsRemaining = Math.ceil((sessionEnd - admissionDate) / (30 * 24 * 60 * 60 * 1000));
              finalAmount = (amount / totalMonths) * Math.min(monthsRemaining, totalMonths);
            }
            
            const dueDate = new Date(sessionStart);
            dueDate.setDate(feeSettings.due_day_of_month || 10);
            
            await dbClient.query(`
              INSERT INTO student_fee_dues (
                school_id, student_id, academic_session_id, fee_type_id, fee_structure_id,
                due_month, due_date, amount, original_amount, balance, status,
                period_type, is_prorated, generated_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, 'pending', $10, $11, NOW())
            `, [
              schoolId, student_id, academic_session_id, fs.fee_type_id, fs.id,
              'Annual', dueDate, finalAmount, amount, 'yearly', fs.is_prorated_on_join && finalAmount !== amount
            ]);
            duesCreated++;
          }
        } else {
          // Recurring fee - generate period-based dues
          let startMonth = admissionDate.getMonth();
          let startYear = admissionDate.getFullYear();
          
          // If admission is before session start, use session start
          if (admissionDate < sessionStart) {
            startMonth = sessionStart.getMonth();
            startYear = sessionStart.getFullYear();
          }
          
          // Generate dues for each month from start to now (or session end)
          let currentDate = new Date(startYear, startMonth, 1);
          const endDate = today < sessionEnd ? today : sessionEnd;
          
          // Add buffer - generate dues for current month + 1 month ahead
          const generateUntil = new Date(endDate);
          generateUntil.setMonth(generateUntil.getMonth() + 1);
          
          while (currentDate <= generateUntil && currentDate <= sessionEnd) {
            const monthNum = currentDate.getMonth() + 1;
            const monthName = currentDate.toLocaleString('en-US', { month: 'long' });
            const year = currentDate.getFullYear();
            const periodName = `${monthName} ${year}`;
            
            // Check applicability
            let shouldGenerate = true;
            if (applicabilityType === 'specific_months' && applicableMonths.length > 0) {
              shouldGenerate = applicableMonths.includes(monthNum);
            }
            
            if (shouldGenerate) {
              // Check if due already exists
              const existingDue = await dbClient.query(`
                SELECT id FROM student_fee_dues
                WHERE student_id = $1 AND fee_type_id = $2 AND academic_session_id = $3
                  AND due_month = $4
              `, [student_id, fs.fee_type_id, academic_session_id, periodName]);
              
              if (existingDue.rows.length === 0) {
                const dueDate = new Date(year, currentDate.getMonth(), feeSettings.due_day_of_month || 10);
                
                await dbClient.query(`
                  INSERT INTO student_fee_dues (
                    school_id, student_id, academic_session_id, fee_type_id, fee_structure_id,
                    due_month, due_date, amount, original_amount, balance, status,
                    period_start, period_end, period_type, generated_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $8, 'pending', $9, $10, $11, NOW())
                `, [
                  schoolId, student_id, academic_session_id, fs.fee_type_id, fs.id,
                  periodName, dueDate, amount,
                  new Date(year, currentDate.getMonth(), 1),
                  new Date(year, currentDate.getMonth() + 1, 0),
                  frequency
                ]);
                duesCreated++;
              }
            }
            
            // Move to next month
            currentDate.setMonth(currentDate.getMonth() + 1);
          }
        }
      }
      
      await dbClient.query('COMMIT');
      
      res.json({
        success: true,
        message: `Generated ${duesCreated} fee dues for ${student.first_name} ${student.last_name}`,
        duesCreated
      });
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Generate student dues error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate fee dues' });
  }
};

