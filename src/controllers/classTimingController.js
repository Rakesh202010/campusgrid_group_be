import { getGroupDbClient } from '../lib/groupDb.js';

// =====================================================
// SCHOOL TIMING SETTINGS
// =====================================================

export const getTimingSettings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT * FROM school_timing_settings WHERE school_id = $1`,
        [schoolId]
      );

      if (result.rows.length === 0) {
        // Return defaults if not configured
        return res.json({
          success: true,
          data: {
            schoolStartTime: '08:00',
            schoolEndTime: '15:00',
            gateOpenTime: '07:30',
            gateCloseTime: '09:00',
            defaultPeriodDuration: 45,
            defaultBreakDuration: 15,
            defaultLunchDuration: 45,
            bellBeforePeriod: 5,
            workingDays: [1, 2, 3, 4, 5, 6],
            timezone: 'Asia/Kolkata',
            isConfigured: false
          }
        });
      }

      const row = result.rows[0];
      res.json({
        success: true,
        data: {
          id: row.id,
          schoolStartTime: row.school_start_time,
          schoolEndTime: row.school_end_time,
          gateOpenTime: row.gate_open_time,
          gateCloseTime: row.gate_close_time,
          defaultPeriodDuration: row.default_period_duration,
          defaultBreakDuration: row.default_break_duration,
          defaultLunchDuration: row.default_lunch_duration,
          bellBeforePeriod: row.bell_before_period,
          workingDays: row.working_days,
          timezone: row.timezone,
          isConfigured: true
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting timing settings:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve timing settings.' });
  }
};

export const saveTimingSettings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const {
      schoolStartTime, schoolEndTime, gateOpenTime, gateCloseTime,
      defaultPeriodDuration, defaultBreakDuration, defaultLunchDuration,
      bellBeforePeriod, workingDays, timezone
    } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `INSERT INTO school_timing_settings (
          school_id, school_start_time, school_end_time, gate_open_time, gate_close_time,
          default_period_duration, default_break_duration, default_lunch_duration,
          bell_before_period, working_days, timezone
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (school_id) DO UPDATE SET
          school_start_time = EXCLUDED.school_start_time,
          school_end_time = EXCLUDED.school_end_time,
          gate_open_time = EXCLUDED.gate_open_time,
          gate_close_time = EXCLUDED.gate_close_time,
          default_period_duration = EXCLUDED.default_period_duration,
          default_break_duration = EXCLUDED.default_break_duration,
          default_lunch_duration = EXCLUDED.default_lunch_duration,
          bell_before_period = EXCLUDED.bell_before_period,
          working_days = EXCLUDED.working_days,
          timezone = EXCLUDED.timezone,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [
          schoolId, schoolStartTime, schoolEndTime, gateOpenTime, gateCloseTime,
          defaultPeriodDuration || 45, defaultBreakDuration || 15, defaultLunchDuration || 45,
          bellBeforePeriod || 5, workingDays || [1, 2, 3, 4, 5, 6], timezone || 'Asia/Kolkata'
        ]
      );

      res.json({ success: true, message: 'Timing settings saved successfully.', data: result.rows[0] });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error saving timing settings:', error);
    res.status(500).json({ success: false, message: 'Failed to save timing settings.' });
  }
};

// =====================================================
// TIMING TEMPLATES
// =====================================================

export const getTemplates = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT t.*,
          (SELECT COUNT(*) FROM class_periods WHERE template_id = t.id) as period_count,
          (SELECT COUNT(*) FROM break_periods WHERE template_id = t.id) as break_count
         FROM class_timing_templates t
         WHERE t.school_id = $1
         ORDER BY t.is_default DESC, t.name ASC`,
        [schoolId]
      );

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          code: row.code,
          description: row.description,
          isDefault: row.is_default,
          isActive: row.is_active,
          applicableDays: row.applicable_days,
          effectiveFrom: row.effective_from,
          effectiveTo: row.effective_to,
          periodCount: parseInt(row.period_count),
          breakCount: parseInt(row.break_count),
          createdAt: row.created_at
        }))
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting templates:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve templates.' });
  }
};

export const getTemplateById = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const dbClient = await getGroupDbClient(groupId);

    try {
      const templateResult = await dbClient.query(
        `SELECT * FROM class_timing_templates WHERE id = $1 AND school_id = $2`,
        [id, schoolId]
      );

      if (templateResult.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Template not found.' });
      }

      const periodsResult = await dbClient.query(
        `SELECT * FROM class_periods WHERE template_id = $1 ORDER BY order_index`,
        [id]
      );

      const breaksResult = await dbClient.query(
        `SELECT * FROM break_periods WHERE template_id = $1 ORDER BY order_index`,
        [id]
      );

      const template = templateResult.rows[0];
      res.json({
        success: true,
        data: {
          id: template.id,
          name: template.name,
          code: template.code,
          description: template.description,
          isDefault: template.is_default,
          isActive: template.is_active,
          applicableDays: template.applicable_days,
          effectiveFrom: template.effective_from,
          effectiveTo: template.effective_to,
          periods: periodsResult.rows.map(p => ({
            id: p.id,
            periodNumber: p.period_number,
            name: p.name,
            shortName: p.short_name,
            startTime: p.start_time,
            endTime: p.end_time,
            durationMinutes: p.duration_minutes,
            periodType: p.period_type,
            isActive: p.is_active,
            orderIndex: p.order_index
          })),
          breaks: breaksResult.rows.map(b => ({
            id: b.id,
            name: b.name,
            shortName: b.short_name,
            startTime: b.start_time,
            endTime: b.end_time,
            durationMinutes: b.duration_minutes,
            breakType: b.break_type,
            afterPeriod: b.after_period,
            isActive: b.is_active,
            orderIndex: b.order_index
          }))
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting template:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve template.' });
  }
};

export const createTemplate = async (req, res) => {
  try {
    const { groupId, schoolId, userId } = req.user;
    const { name, code, description, isDefault, applicableDays, effectiveFrom, effectiveTo } = req.body;

    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Name and code are required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // If this is default, unset other defaults
      if (isDefault) {
        await dbClient.query(
          `UPDATE class_timing_templates SET is_default = FALSE WHERE school_id = $1`,
          [schoolId]
        );
      }

      const result = await dbClient.query(
        `INSERT INTO class_timing_templates (
          school_id, name, code, description, is_default, applicable_days, effective_from, effective_to, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [schoolId, name, code, description, isDefault || false, applicableDays || [1, 2, 3, 4, 5, 6], effectiveFrom, effectiveTo, userId]
      );

      res.status(201).json({ success: true, message: 'Template created successfully.', data: result.rows[0] });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error creating template:', error);
    if (error.code === '23505') {
      return res.status(400).json({ success: false, message: 'Template with this code already exists.' });
    }
    res.status(500).json({ success: false, message: 'Failed to create template.' });
  }
};

export const updateTemplate = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { name, code, description, isDefault, isActive, applicableDays, effectiveFrom, effectiveTo } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // If this is default, unset other defaults
      if (isDefault) {
        await dbClient.query(
          `UPDATE class_timing_templates SET is_default = FALSE WHERE school_id = $1 AND id != $2`,
          [schoolId, id]
        );
      }

      const result = await dbClient.query(
        `UPDATE class_timing_templates SET
          name = COALESCE($1, name),
          code = COALESCE($2, code),
          description = COALESCE($3, description),
          is_default = COALESCE($4, is_default),
          is_active = COALESCE($5, is_active),
          applicable_days = COALESCE($6, applicable_days),
          effective_from = $7,
          effective_to = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $9 AND school_id = $10
        RETURNING *`,
        [name, code, description, isDefault, isActive, applicableDays, effectiveFrom, effectiveTo, id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Template not found.' });
      }

      res.json({ success: true, message: 'Template updated successfully.', data: result.rows[0] });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error updating template:', error);
    res.status(500).json({ success: false, message: 'Failed to update template.' });
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM class_timing_templates WHERE id = $1 AND school_id = $2 AND is_default = FALSE RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ success: false, message: 'Cannot delete default template or template not found.' });
      }

      res.json({ success: true, message: 'Template deleted successfully.' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ success: false, message: 'Failed to delete template.' });
  }
};

// =====================================================
// PERIODS MANAGEMENT
// =====================================================

export const savePeriods = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { templateId } = req.params;
    const { periods } = req.body;

    if (!Array.isArray(periods)) {
      return res.status(400).json({ success: false, message: 'Periods must be an array.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Verify template belongs to school
      const templateCheck = await dbClient.query(
        `SELECT id FROM class_timing_templates WHERE id = $1 AND school_id = $2`,
        [templateId, schoolId]
      );

      if (templateCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Template not found.' });
      }

      // Delete existing periods
      await dbClient.query(`DELETE FROM class_periods WHERE template_id = $1`, [templateId]);

      // Insert new periods
      for (let i = 0; i < periods.length; i++) {
        const p = periods[i];
        await dbClient.query(
          `INSERT INTO class_periods (
            school_id, template_id, period_number, name, short_name, start_time, end_time, period_type, is_active, order_index
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [schoolId, templateId, p.periodNumber || i + 1, p.name, p.shortName || `P${i + 1}`, p.startTime, p.endTime, p.periodType || 'regular', p.isActive !== false, i]
        );
      }

      res.json({ success: true, message: 'Periods saved successfully.' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error saving periods:', error);
    res.status(500).json({ success: false, message: 'Failed to save periods.' });
  }
};

export const saveBreaks = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { templateId } = req.params;
    const { breaks } = req.body;

    if (!Array.isArray(breaks)) {
      return res.status(400).json({ success: false, message: 'Breaks must be an array.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Verify template belongs to school
      const templateCheck = await dbClient.query(
        `SELECT id FROM class_timing_templates WHERE id = $1 AND school_id = $2`,
        [templateId, schoolId]
      );

      if (templateCheck.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Template not found.' });
      }

      // Delete existing breaks
      await dbClient.query(`DELETE FROM break_periods WHERE template_id = $1`, [templateId]);

      // Insert new breaks
      for (let i = 0; i < breaks.length; i++) {
        const b = breaks[i];
        await dbClient.query(
          `INSERT INTO break_periods (
            school_id, template_id, name, short_name, start_time, end_time, break_type, after_period, is_active, order_index
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [schoolId, templateId, b.name, b.shortName, b.startTime, b.endTime, b.breakType || 'short_break', b.afterPeriod, b.isActive !== false, i]
        );
      }

      res.json({ success: true, message: 'Breaks saved successfully.' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error saving breaks:', error);
    res.status(500).json({ success: false, message: 'Failed to save breaks.' });
  }
};

// =====================================================
// GET ACTIVE TIMING (For Timetable Use)
// =====================================================

export const getActiveTiming = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { date } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for exception on this date
      let templateId = null;
      let isException = false;
      let exceptionInfo = null;

      if (date) {
        const exceptionResult = await dbClient.query(
          `SELECT * FROM timing_exceptions WHERE school_id = $1 AND exception_date = $2`,
          [schoolId, date]
        );

        if (exceptionResult.rows.length > 0) {
          const exception = exceptionResult.rows[0];
          isException = true;
          exceptionInfo = {
            type: exception.exception_type,
            reason: exception.reason,
            isNoSchool: exception.is_no_school
          };
          templateId = exception.template_id;

          if (exception.is_no_school) {
            return res.json({
              success: true,
              data: {
                isException: true,
                isNoSchool: true,
                exceptionInfo,
                periods: [],
                breaks: []
              }
            });
          }
        }
      }

      // Get default template if no exception template
      if (!templateId) {
        const defaultResult = await dbClient.query(
          `SELECT id FROM class_timing_templates WHERE school_id = $1 AND is_default = TRUE AND is_active = TRUE`,
          [schoolId]
        );

        if (defaultResult.rows.length === 0) {
          return res.json({
            success: true,
            data: {
              isConfigured: false,
              periods: [],
              breaks: [],
              message: 'No timing template configured. Please set up class timings in Settings.'
            }
          });
        }

        templateId = defaultResult.rows[0].id;
      }

      // Get periods and breaks
      const periodsResult = await dbClient.query(
        `SELECT * FROM class_periods WHERE template_id = $1 AND is_active = TRUE ORDER BY order_index`,
        [templateId]
      );

      const breaksResult = await dbClient.query(
        `SELECT * FROM break_periods WHERE template_id = $1 AND is_active = TRUE ORDER BY order_index`,
        [templateId]
      );

      // Get school settings
      const settingsResult = await dbClient.query(
        `SELECT * FROM school_timing_settings WHERE school_id = $1`,
        [schoolId]
      );

      const settings = settingsResult.rows[0] || {};

      // Merge periods and breaks into ordered slots
      const slots = [];
      const periods = periodsResult.rows;
      const breaks = breaksResult.rows;

      // Create a combined timeline
      periods.forEach(p => {
        slots.push({
          id: p.id,
          type: 'period',
          periodNumber: p.period_number,
          name: p.name,
          shortName: p.short_name,
          startTime: p.start_time,
          endTime: p.end_time,
          durationMinutes: p.duration_minutes,
          periodType: p.period_type,
          orderIndex: p.order_index
        });
      });

      breaks.forEach(b => {
        slots.push({
          id: b.id,
          type: 'break',
          name: b.name,
          shortName: b.short_name,
          startTime: b.start_time,
          endTime: b.end_time,
          durationMinutes: b.duration_minutes,
          breakType: b.break_type,
          afterPeriod: b.after_period,
          orderIndex: b.order_index + 1000 // Ensure breaks sort after their period
        });
      });

      // Sort by start time
      slots.sort((a, b) => a.startTime.localeCompare(b.startTime));

      res.json({
        success: true,
        data: {
          isConfigured: true,
          isException,
          exceptionInfo,
          templateId,
          schoolStartTime: settings.school_start_time || '08:00',
          schoolEndTime: settings.school_end_time || '15:00',
          workingDays: settings.working_days || [1, 2, 3, 4, 5, 6],
          slots,
          periods: periods.map(p => ({
            id: p.id,
            periodNumber: p.period_number,
            name: p.name,
            shortName: p.short_name,
            startTime: p.start_time,
            endTime: p.end_time,
            durationMinutes: p.duration_minutes,
            periodType: p.period_type
          })),
          breaks: breaks.map(b => ({
            id: b.id,
            name: b.name,
            shortName: b.short_name,
            startTime: b.start_time,
            endTime: b.end_time,
            durationMinutes: b.duration_minutes,
            breakType: b.break_type,
            afterPeriod: b.after_period
          }))
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting active timing:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve active timing.' });
  }
};

// =====================================================
// TIMING EXCEPTIONS
// =====================================================

export const getExceptions = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { month, year } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT e.*, t.name as template_name
        FROM timing_exceptions e
        LEFT JOIN class_timing_templates t ON e.template_id = t.id
        WHERE e.school_id = $1
      `;
      const params = [schoolId];

      if (month && year) {
        query += ` AND EXTRACT(MONTH FROM e.exception_date) = $2 AND EXTRACT(YEAR FROM e.exception_date) = $3`;
        params.push(month, year);
      }

      query += ` ORDER BY e.exception_date DESC`;

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          exceptionDate: row.exception_date,
          templateId: row.template_id,
          templateName: row.template_name,
          exceptionType: row.exception_type,
          reason: row.reason,
          isNoSchool: row.is_no_school,
          customStartTime: row.custom_start_time,
          customEndTime: row.custom_end_time
        }))
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting exceptions:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve exceptions.' });
  }
};

export const createException = async (req, res) => {
  try {
    const { groupId, schoolId, userId } = req.user;
    const { exceptionDate, templateId, exceptionType, reason, isNoSchool, customStartTime, customEndTime } = req.body;

    if (!exceptionDate || !exceptionType) {
      return res.status(400).json({ success: false, message: 'Date and exception type are required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Convert empty strings to null for UUID fields
      const cleanTemplateId = templateId && templateId.trim() !== '' ? templateId : null;
      const cleanUserId = userId && userId.trim() !== '' ? userId : null;

      const result = await dbClient.query(
        `INSERT INTO timing_exceptions (
          school_id, exception_date, template_id, exception_type, reason, is_no_school, custom_start_time, custom_end_time, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (school_id, exception_date) DO UPDATE SET
          template_id = EXCLUDED.template_id,
          exception_type = EXCLUDED.exception_type,
          reason = EXCLUDED.reason,
          is_no_school = EXCLUDED.is_no_school,
          custom_start_time = EXCLUDED.custom_start_time,
          custom_end_time = EXCLUDED.custom_end_time,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [schoolId, exceptionDate, cleanTemplateId, exceptionType, reason || null, isNoSchool || false, customStartTime || null, customEndTime || null, cleanUserId]
      );

      res.status(201).json({ success: true, message: 'Exception saved successfully.', data: result.rows[0] });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error creating exception:', error);
    res.status(500).json({ success: false, message: 'Failed to save exception.' });
  }
};

export const deleteException = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM timing_exceptions WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Exception not found.' });
      }

      res.json({ success: true, message: 'Exception deleted successfully.' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error deleting exception:', error);
    res.status(500).json({ success: false, message: 'Failed to delete exception.' });
  }
};

// =====================================================
// DAY-WISE SCHOOL TIMINGS
// =====================================================

export const getDayWiseTimings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT dt.*, t.name as template_name, t.code as template_code
         FROM school_day_timings dt
         LEFT JOIN class_timing_templates t ON dt.template_id = t.id
         WHERE dt.school_id = $1
         ORDER BY dt.day_of_week`,
        [schoolId]
      );

      // Create full week data with defaults for missing days
      const daysOfWeek = [
        { id: 0, name: 'Sunday', short: 'Sun' },
        { id: 1, name: 'Monday', short: 'Mon' },
        { id: 2, name: 'Tuesday', short: 'Tue' },
        { id: 3, name: 'Wednesday', short: 'Wed' },
        { id: 4, name: 'Thursday', short: 'Thu' },
        { id: 5, name: 'Friday', short: 'Fri' },
        { id: 6, name: 'Saturday', short: 'Sat' }
      ];

      const existingData = {};
      result.rows.forEach(row => {
        existingData[row.day_of_week] = {
          id: row.id,
          dayOfWeek: row.day_of_week,
          schoolStartTime: row.school_start_time,
          schoolEndTime: row.school_end_time,
          isWorkingDay: row.is_working_day,
          isHalfDay: row.is_half_day,
          templateId: row.template_id,
          templateName: row.template_name,
          templateCode: row.template_code
        };
      });

      // Get default settings
      const settingsResult = await dbClient.query(
        `SELECT school_start_time, school_end_time FROM school_timing_settings WHERE school_id = $1`,
        [schoolId]
      );
      const defaultStart = settingsResult.rows[0]?.school_start_time || '08:00';
      const defaultEnd = settingsResult.rows[0]?.school_end_time || '15:00';

      const weekData = daysOfWeek.map(day => {
        if (existingData[day.id]) {
          return { ...day, ...existingData[day.id] };
        }
        // Default values
        return {
          ...day,
          dayOfWeek: day.id,
          schoolStartTime: day.id === 0 ? null : defaultStart, // Sunday closed by default
          schoolEndTime: day.id === 0 ? null : (day.id === 6 ? '12:30' : defaultEnd), // Saturday half day
          isWorkingDay: day.id !== 0, // Sunday not working
          isHalfDay: day.id === 6, // Saturday half day
          templateId: null,
          templateName: null
        };
      });

      res.json({ success: true, data: weekData });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting day-wise timings:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve day-wise timings.' });
  }
};

export const saveDayWiseTimings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { dayTimings } = req.body;

    if (!Array.isArray(dayTimings)) {
      return res.status(400).json({ success: false, message: 'dayTimings must be an array.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      for (const day of dayTimings) {
        if (day.dayOfWeek < 0 || day.dayOfWeek > 6) continue;

        await dbClient.query(
          `INSERT INTO school_day_timings (
            school_id, day_of_week, school_start_time, school_end_time, is_working_day, is_half_day, template_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (school_id, day_of_week) DO UPDATE SET
            school_start_time = EXCLUDED.school_start_time,
            school_end_time = EXCLUDED.school_end_time,
            is_working_day = EXCLUDED.is_working_day,
            is_half_day = EXCLUDED.is_half_day,
            template_id = EXCLUDED.template_id,
            updated_at = CURRENT_TIMESTAMP`,
          [
            schoolId,
            day.dayOfWeek,
            day.isWorkingDay ? day.schoolStartTime : null,
            day.isWorkingDay ? day.schoolEndTime : null,
            day.isWorkingDay !== false,
            day.isHalfDay || false,
            day.templateId || null
          ]
        );
      }

      res.json({ success: true, message: 'Day-wise timings saved successfully.' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error saving day-wise timings:', error);
    res.status(500).json({ success: false, message: 'Failed to save day-wise timings.' });
  }
};

// Get timing for a specific date (considers day-wise, exceptions, templates)
export const getTimingForDate = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { date } = req.params;

    if (!date) {
      return res.status(400).json({ success: false, message: 'Date is required.' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const targetDate = new Date(date);
      const dayOfWeek = targetDate.getDay(); // 0 = Sunday, 6 = Saturday

      // 1. Check for exception on this date
      const exceptionResult = await dbClient.query(
        `SELECT e.*, t.name as template_name, t.school_start_time as template_start, t.school_end_time as template_end
         FROM timing_exceptions e
         LEFT JOIN class_timing_templates t ON e.template_id = t.id
         WHERE e.school_id = $1 AND e.exception_date = $2`,
        [schoolId, date]
      );

      if (exceptionResult.rows.length > 0) {
        const exception = exceptionResult.rows[0];
        
        if (exception.is_no_school) {
          return res.json({
            success: true,
            data: {
              date,
              dayOfWeek,
              isWorkingDay: false,
              isNoSchool: true,
              reason: exception.reason,
              source: 'exception'
            }
          });
        }

        // Use exception's custom timing or template timing
        const startTime = exception.custom_start_time || exception.template_start;
        const endTime = exception.custom_end_time || exception.template_end;

        return res.json({
          success: true,
          data: {
            date,
            dayOfWeek,
            isWorkingDay: true,
            schoolStartTime: startTime,
            schoolEndTime: endTime,
            templateId: exception.template_id,
            templateName: exception.template_name,
            reason: exception.reason,
            source: 'exception'
          }
        });
      }

      // 2. Check day-wise timing
      const dayResult = await dbClient.query(
        `SELECT dt.*, t.name as template_name, t.school_start_time as template_start, t.school_end_time as template_end
         FROM school_day_timings dt
         LEFT JOIN class_timing_templates t ON dt.template_id = t.id
         WHERE dt.school_id = $1 AND dt.day_of_week = $2`,
        [schoolId, dayOfWeek]
      );

      if (dayResult.rows.length > 0) {
        const dayTiming = dayResult.rows[0];

        if (!dayTiming.is_working_day) {
          return res.json({
            success: true,
            data: {
              date,
              dayOfWeek,
              isWorkingDay: false,
              source: 'day_config'
            }
          });
        }

        // Use day's timing or template timing
        const startTime = dayTiming.school_start_time || dayTiming.template_start;
        const endTime = dayTiming.school_end_time || dayTiming.template_end;

        return res.json({
          success: true,
          data: {
            date,
            dayOfWeek,
            isWorkingDay: true,
            isHalfDay: dayTiming.is_half_day,
            schoolStartTime: startTime,
            schoolEndTime: endTime,
            templateId: dayTiming.template_id,
            templateName: dayTiming.template_name,
            source: 'day_config'
          }
        });
      }

      // 3. Fall back to default settings
      const settingsResult = await dbClient.query(
        `SELECT * FROM school_timing_settings WHERE school_id = $1`,
        [schoolId]
      );

      const settings = settingsResult.rows[0];
      const workingDays = settings?.working_days || [1, 2, 3, 4, 5, 6];
      const isWorkingDay = workingDays.includes(dayOfWeek);

      res.json({
        success: true,
        data: {
          date,
          dayOfWeek,
          isWorkingDay,
          schoolStartTime: isWorkingDay ? (settings?.school_start_time || '08:00') : null,
          schoolEndTime: isWorkingDay ? (settings?.school_end_time || '15:00') : null,
          source: 'default'
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error getting timing for date:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve timing for date.' });
  }
};

// =====================================================
// QUICK SETUP - Generate Default Template
// =====================================================

export const generateDefaultTemplate = async (req, res) => {
  try {
    const { groupId, schoolId, userId } = req.user;
    const { schoolStartTime, periodsCount, periodDuration, breakAfterPeriods, breakDuration, lunchAfterPeriod, lunchDuration } = req.body;

    const startTime = schoolStartTime || '08:00';
    const numPeriods = periodsCount || 8;
    const periodMins = periodDuration || 45;
    const breakAfter = breakAfterPeriods || [3]; // After which periods to add breaks
    const breakMins = breakDuration || 15;
    const lunchAfter = lunchAfterPeriod || 5;
    const lunchMins = lunchDuration || 45;

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Create default template
      const templateResult = await dbClient.query(
        `INSERT INTO class_timing_templates (
          school_id, name, code, description, is_default, applicable_days, created_by
        ) VALUES ($1, 'Regular Day', 'REGULAR', 'Standard school day timing', TRUE, ARRAY[1,2,3,4,5,6], $2)
        ON CONFLICT (school_id, code) DO UPDATE SET
          is_default = TRUE,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id`,
        [schoolId, userId]
      );

      const templateId = templateResult.rows[0].id;

      // Clear existing periods and breaks
      await dbClient.query(`DELETE FROM class_periods WHERE template_id = $1`, [templateId]);
      await dbClient.query(`DELETE FROM break_periods WHERE template_id = $1`, [templateId]);

      // Generate periods and breaks
      const [startHour, startMin] = startTime.split(':').map(Number);
      let currentTime = startHour * 60 + startMin; // Convert to minutes

      const formatTime = (mins) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };

      let orderIndex = 0;
      let breakIndex = 0;

      for (let i = 1; i <= numPeriods; i++) {
        const periodStart = formatTime(currentTime);
        currentTime += periodMins;
        const periodEnd = formatTime(currentTime);

        await dbClient.query(
          `INSERT INTO class_periods (school_id, template_id, period_number, name, short_name, start_time, end_time, period_type, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'regular', $8)`,
          [schoolId, templateId, i, `Period ${i}`, `P${i}`, periodStart, periodEnd, orderIndex++]
        );

        // Add lunch after specific period
        if (i === lunchAfter) {
          const lunchStart = formatTime(currentTime);
          currentTime += lunchMins;
          const lunchEnd = formatTime(currentTime);

          await dbClient.query(
            `INSERT INTO break_periods (school_id, template_id, name, short_name, start_time, end_time, break_type, after_period, order_index)
             VALUES ($1, $2, 'Lunch Break', 'Lunch', $3, $4, 'lunch', $5, $6)`,
            [schoolId, templateId, lunchStart, lunchEnd, i, breakIndex++]
          );
        }
        // Add short break after specific periods
        else if (breakAfter.includes(i) && i !== numPeriods) {
          const breakStart = formatTime(currentTime);
          currentTime += breakMins;
          const breakEnd = formatTime(currentTime);

          await dbClient.query(
            `INSERT INTO break_periods (school_id, template_id, name, short_name, start_time, end_time, break_type, after_period, order_index)
             VALUES ($1, $2, 'Short Break', 'Break', $3, $4, 'short_break', $5, $6)`,
            [schoolId, templateId, breakStart, breakEnd, i, breakIndex++]
          );
        }
      }

      // Save school timing settings
      const schoolEndTime = formatTime(currentTime);
      await dbClient.query(
        `INSERT INTO school_timing_settings (school_id, school_start_time, school_end_time, default_period_duration, default_break_duration, default_lunch_duration)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (school_id) DO UPDATE SET
           school_start_time = EXCLUDED.school_start_time,
           school_end_time = EXCLUDED.school_end_time,
           default_period_duration = EXCLUDED.default_period_duration,
           default_break_duration = EXCLUDED.default_break_duration,
           default_lunch_duration = EXCLUDED.default_lunch_duration,
           updated_at = CURRENT_TIMESTAMP`,
        [schoolId, startTime, schoolEndTime, periodMins, breakMins, lunchMins]
      );

      res.json({
        success: true,
        message: 'Default timing template generated successfully.',
        data: {
          templateId,
          schoolStartTime: startTime,
          schoolEndTime,
          periodsCount: numPeriods,
          periodDuration: periodMins
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Error generating default template:', error);
    res.status(500).json({ success: false, message: 'Failed to generate default template.' });
  }
};

