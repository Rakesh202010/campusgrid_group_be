import { getGroupDbClient } from '../lib/groupDb.js';

// Get all number generation settings
export const getNumberSettings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `SELECT * FROM number_generation_settings WHERE school_id = $1 ORDER BY setting_type`,
        [schoolId]
      );

      const settings = {};
      result.rows.forEach(row => {
        settings[row.setting_type] = {
          id: row.id,
          settingType: row.setting_type,
          prefix: row.prefix || '',
          suffix: row.suffix || '',
          separator: row.separator || '/',
          startNumber: row.start_number,
          currentNumber: row.current_number,
          numberLength: row.number_length,
          includeYear: row.include_year,
          yearFormat: row.year_format,
          includeClass: row.include_class,
          includeSection: row.include_section,
          includeSession: row.include_session,
          resetYearly: row.reset_yearly,
          resetOnClassChange: row.reset_on_class_change,
          rollNumberType: row.roll_number_type,
          rollPerClass: row.roll_per_class,
          exampleFormat: row.example_format,
          isActive: row.is_active
        };
      });

      res.json({ success: true, data: settings });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get number settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch settings' });
  }
};

// Update number generation settings
export const updateNumberSettings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { settingType } = req.params;
    const {
      prefix, suffix, separator, startNumber, numberLength,
      includeYear, yearFormat, includeClass, includeSection, includeSession,
      resetYearly, resetOnClassChange, rollNumberType, rollPerClass
    } = req.body;

    if (!['admission_number', 'roll_number'].includes(settingType)) {
      return res.status(400).json({ success: false, message: 'Invalid setting type' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Generate example format
      const exampleFormat = generateExampleFormat({
        settingType, prefix, suffix, separator, numberLength,
        includeYear, yearFormat, includeClass, includeSection
      });

      const result = await dbClient.query(
        `INSERT INTO number_generation_settings (
          school_id, setting_type, prefix, suffix, separator, start_number, number_length,
          include_year, year_format, include_class, include_section, include_session,
          reset_yearly, reset_on_class_change, roll_number_type, roll_per_class, example_format, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
        ON CONFLICT (school_id, setting_type) DO UPDATE SET
          prefix = EXCLUDED.prefix,
          suffix = EXCLUDED.suffix,
          separator = EXCLUDED.separator,
          start_number = EXCLUDED.start_number,
          number_length = EXCLUDED.number_length,
          include_year = EXCLUDED.include_year,
          year_format = EXCLUDED.year_format,
          include_class = EXCLUDED.include_class,
          include_section = EXCLUDED.include_section,
          include_session = EXCLUDED.include_session,
          reset_yearly = EXCLUDED.reset_yearly,
          reset_on_class_change = EXCLUDED.reset_on_class_change,
          roll_number_type = EXCLUDED.roll_number_type,
          roll_per_class = EXCLUDED.roll_per_class,
          example_format = EXCLUDED.example_format,
          updated_at = NOW()
        RETURNING *`,
        [
          schoolId, settingType, prefix || '', suffix || '', separator || '/',
          startNumber || 1, numberLength || 4,
          includeYear !== false, yearFormat || 'YY',
          includeClass || false, includeSection || false, includeSession || false,
          resetYearly !== false, resetOnClassChange || false,
          rollNumberType || 'sequential', rollPerClass !== false, exampleFormat
        ]
      );

      const row = result.rows[0];
      res.json({
        success: true,
        message: 'Settings updated successfully',
        data: {
          id: row.id,
          settingType: row.setting_type,
          prefix: row.prefix,
          suffix: row.suffix,
          separator: row.separator,
          startNumber: row.start_number,
          currentNumber: row.current_number,
          numberLength: row.number_length,
          includeYear: row.include_year,
          yearFormat: row.year_format,
          includeClass: row.include_class,
          includeSection: row.include_section,
          includeSession: row.include_session,
          resetYearly: row.reset_yearly,
          resetOnClassChange: row.reset_on_class_change,
          rollNumberType: row.roll_number_type,
          rollPerClass: row.roll_per_class,
          exampleFormat: row.example_format
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Update number settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings' });
  }
};

// Generate next admission number
export const getNextAdmissionNumber = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { classSectionId } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get settings
      const settingsResult = await dbClient.query(
        `SELECT * FROM number_generation_settings WHERE school_id = $1 AND setting_type = 'admission_number'`,
        [schoolId]
      );

      let settings = settingsResult.rows[0];
      
      // If no settings, create default
      if (!settings) {
        const insertResult = await dbClient.query(
          `INSERT INTO number_generation_settings (school_id, setting_type, prefix, start_number, current_number, number_length, include_year, year_format, reset_yearly, example_format)
           VALUES ($1, 'admission_number', 'ADM', 1, 0, 4, true, 'YY', true, 'ADM/25/0001')
           RETURNING *`,
          [schoolId]
        );
        settings = insertResult.rows[0];
      }

      // Check if we need to reset for new year
      const currentYear = new Date().getFullYear();
      let nextNumber = settings.current_number + 1;
      
      if (settings.reset_yearly) {
        // Get the year of the last generated number
        const lastStudentResult = await dbClient.query(
          `SELECT admission_number, created_at FROM students 
           WHERE school_id = $1 AND admission_number IS NOT NULL 
           ORDER BY created_at DESC LIMIT 1`,
          [schoolId]
        );
        
        if (lastStudentResult.rows.length > 0) {
          const lastYear = new Date(lastStudentResult.rows[0].created_at).getFullYear();
          if (lastYear < currentYear) {
            nextNumber = settings.start_number;
          }
        } else {
          nextNumber = settings.start_number;
        }
      }

      // Get class info if needed
      let classCode = '';
      let sectionCode = '';
      if ((settings.include_class || settings.include_section) && classSectionId) {
        const classResult = await dbClient.query(
          `SELECT cg.name as grade_name, cg.numeric_value, sec.name as section_name
           FROM class_sections cs
           JOIN class_grades cg ON cs.class_grade_id = cg.id
           JOIN sections sec ON cs.section_id = sec.id
           WHERE cs.id = $1`,
          [classSectionId]
        );
        if (classResult.rows.length > 0) {
          classCode = classResult.rows[0].numeric_value?.toString().padStart(2, '0') || '';
          sectionCode = classResult.rows[0].section_name?.[0] || '';
        }
      }

      // Generate the admission number
      const admissionNumber = formatNumber({
        prefix: settings.prefix,
        suffix: settings.suffix,
        separator: settings.separator,
        number: nextNumber,
        numberLength: settings.number_length,
        includeYear: settings.include_year,
        yearFormat: settings.year_format,
        classCode: settings.include_class ? classCode : '',
        sectionCode: settings.include_section ? sectionCode : ''
      });

      res.json({
        success: true,
        data: {
          nextAdmissionNumber: admissionNumber,
          nextNumber: nextNumber,
          settings: {
            prefix: settings.prefix,
            separator: settings.separator,
            numberLength: settings.number_length,
            includeYear: settings.include_year,
            yearFormat: settings.year_format
          }
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get next admission number error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate admission number' });
  }
};

// Generate next roll number for a class
export const getNextRollNumber = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { classSectionId, academicSessionId } = req.query;

    if (!classSectionId) {
      return res.status(400).json({ success: false, message: 'Class section is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get settings
      const settingsResult = await dbClient.query(
        `SELECT * FROM number_generation_settings WHERE school_id = $1 AND setting_type = 'roll_number'`,
        [schoolId]
      );

      let settings = settingsResult.rows[0];
      
      // If no settings, create default
      if (!settings) {
        const insertResult = await dbClient.query(
          `INSERT INTO number_generation_settings (school_id, setting_type, prefix, start_number, current_number, number_length, roll_number_type, roll_per_class, example_format)
           VALUES ($1, 'roll_number', '', 1, 0, 2, 'sequential', true, '01')
           RETURNING *`,
          [schoolId]
        );
        settings = insertResult.rows[0];
      }

      // Get the highest roll number in this class for this session
      let query = `
        SELECT MAX(CAST(NULLIF(roll_number, '') AS INTEGER)) as max_roll
        FROM students
        WHERE school_id = $1 AND current_class_section_id = $2 AND status = 'active'
      `;
      const params = [schoolId, classSectionId];

      if (academicSessionId) {
        query += ` AND academic_session_id = $3`;
        params.push(academicSessionId);
      }

      const maxRollResult = await dbClient.query(query, params);
      const maxRoll = maxRollResult.rows[0]?.max_roll || 0;
      const nextRoll = Math.max(maxRoll + 1, settings.start_number);

      // Format the roll number
      let rollNumber;
      if (settings.roll_number_type === 'sequential') {
        rollNumber = nextRoll.toString().padStart(settings.number_length, '0');
      } else {
        rollNumber = nextRoll.toString();
      }

      if (settings.prefix) {
        rollNumber = settings.prefix + (settings.separator || '') + rollNumber;
      }
      if (settings.suffix) {
        rollNumber = rollNumber + (settings.separator || '') + settings.suffix;
      }

      res.json({
        success: true,
        data: {
          nextRollNumber: rollNumber,
          nextNumber: nextRoll,
          settings: {
            prefix: settings.prefix,
            numberLength: settings.number_length,
            rollNumberType: settings.roll_number_type
          }
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get next roll number error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate roll number' });
  }
};

// Update current number after student is created
export const incrementCurrentNumber = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { settingType } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(
        `UPDATE number_generation_settings 
         SET current_number = current_number + 1, updated_at = NOW()
         WHERE school_id = $1 AND setting_type = $2`,
        [schoolId, settingType]
      );

      res.json({ success: true, message: 'Number incremented' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Increment number error:', error);
    res.status(500).json({ success: false, message: 'Failed to increment number' });
  }
};

// Reset number sequence
export const resetNumberSequence = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { settingType } = req.params;
    const { startFrom } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      await dbClient.query(
        `UPDATE number_generation_settings 
         SET current_number = $3, start_number = $3, updated_at = NOW()
         WHERE school_id = $1 AND setting_type = $2`,
        [schoolId, settingType, startFrom || 0]
      );

      res.json({ success: true, message: 'Sequence reset successfully' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Reset sequence error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset sequence' });
  }
};

// Helper function to format number
function formatNumber({ prefix, suffix, separator, number, numberLength, includeYear, yearFormat, classCode, sectionCode }) {
  const parts = [];
  
  if (prefix) parts.push(prefix);
  
  if (includeYear) {
    const year = new Date().getFullYear();
    parts.push(yearFormat === 'YYYY' ? year.toString() : year.toString().slice(-2));
  }
  
  if (classCode) parts.push(classCode);
  if (sectionCode) parts.push(sectionCode);
  
  parts.push(number.toString().padStart(numberLength, '0'));
  
  if (suffix) parts.push(suffix);
  
  return parts.join(separator || '/');
}

// Helper function to generate example format
function generateExampleFormat({ settingType, prefix, suffix, separator, numberLength, includeYear, yearFormat, includeClass, includeSection }) {
  const parts = [];
  const sep = separator || '/';
  
  if (prefix) parts.push(prefix);
  
  if (includeYear) {
    const year = new Date().getFullYear();
    parts.push(yearFormat === 'YYYY' ? year.toString() : year.toString().slice(-2));
  }
  
  if (includeClass) parts.push('01');
  if (includeSection) parts.push('A');
  
  parts.push('0001'.slice(-numberLength));
  
  if (suffix) parts.push(suffix);
  
  return parts.join(sep);
}

// Bulk generate admission/roll numbers for selected students
export const bulkGenerateNumbers = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { type, studentIds, classSectionId } = req.body;

    if (!studentIds || studentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'No students selected' });
    }

    if (!['admission', 'roll'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid type. Use "admission" or "roll"' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Get settings
      const settingType = type === 'admission' ? 'admission_number' : 'roll_number';
      const settingsResult = await dbClient.query(
        `SELECT * FROM number_generation_settings WHERE school_id = $1 AND setting_type = $2`,
        [schoolId, settingType]
      );

      let settings = settingsResult.rows[0];
      if (!settings) {
        return res.status(400).json({ success: false, message: 'Please configure number settings first' });
      }

      let updated = 0;

      if (type === 'admission') {
        // Generate admission numbers
        let currentNumber = settings.current_number || 0;
        
        for (const studentId of studentIds) {
          currentNumber++;
          const admissionNumber = formatNumber({
            prefix: settings.prefix,
            suffix: settings.suffix,
            separator: settings.separator,
            number: currentNumber,
            numberLength: settings.number_length,
            includeYear: settings.include_year,
            yearFormat: settings.year_format,
            classCode: '',
            sectionCode: ''
          });

          await dbClient.query(
            `UPDATE students SET admission_number = $1, updated_at = NOW() WHERE id = $2 AND school_id = $3`,
            [admissionNumber, studentId, schoolId]
          );
          updated++;
        }

        // Update current number in settings
        await dbClient.query(
          `UPDATE number_generation_settings SET current_number = $1, updated_at = NOW() WHERE school_id = $2 AND setting_type = 'admission_number'`,
          [currentNumber, schoolId]
        );
      } else {
        // Generate roll numbers
        // Group students by class section
        const studentsResult = await dbClient.query(
          `SELECT id, current_class_section_id FROM students WHERE id = ANY($1) AND school_id = $2`,
          [studentIds, schoolId]
        );

        // Group by class
        const studentsByClass = {};
        studentsResult.rows.forEach(s => {
          const classId = s.current_class_section_id || 'unassigned';
          if (!studentsByClass[classId]) studentsByClass[classId] = [];
          studentsByClass[classId].push(s.id);
        });

        // Generate roll numbers per class
        for (const [classId, students] of Object.entries(studentsByClass)) {
          if (classId === 'unassigned') continue;

          // Get max roll number for this class
          const maxRollResult = await dbClient.query(
            `SELECT MAX(CAST(NULLIF(REGEXP_REPLACE(roll_number, '[^0-9]', '', 'g'), '') AS INTEGER)) as max_roll
             FROM students WHERE school_id = $1 AND current_class_section_id = $2 AND status = 'active'`,
            [schoolId, classId]
          );
          
          let currentRoll = maxRollResult.rows[0]?.max_roll || 0;

          for (const studentId of students) {
            currentRoll++;
            let rollNumber = currentRoll.toString().padStart(settings.number_length, '0');
            
            if (settings.prefix) {
              rollNumber = settings.prefix + (settings.separator || '') + rollNumber;
            }
            if (settings.suffix) {
              rollNumber = rollNumber + (settings.separator || '') + settings.suffix;
            }

            await dbClient.query(
              `UPDATE students SET roll_number = $1, updated_at = NOW() WHERE id = $2 AND school_id = $3`,
              [rollNumber, studentId, schoolId]
            );
            updated++;
          }
        }
      }

      res.json({
        success: true,
        message: `Generated ${type} numbers for ${updated} students`,
        data: { updated }
      });

    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Bulk generate error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate numbers' });
  }
};

