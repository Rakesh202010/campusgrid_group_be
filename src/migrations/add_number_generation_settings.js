// Migration: Add number generation settings table
// This table stores configuration for admission numbers and roll numbers

export const up = async (dbClient, schoolId) => {
  // Create number_generation_settings table
  await dbClient.query(`
    CREATE TABLE IF NOT EXISTS number_generation_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      school_id UUID NOT NULL,
      setting_type VARCHAR(50) NOT NULL, -- 'admission_number' or 'roll_number'
      
      -- Format configuration
      prefix VARCHAR(20) DEFAULT '',
      suffix VARCHAR(20) DEFAULT '',
      separator VARCHAR(5) DEFAULT '',
      
      -- Number configuration
      start_number INTEGER DEFAULT 1,
      current_number INTEGER DEFAULT 0,
      number_length INTEGER DEFAULT 4, -- Pad with zeros to this length
      
      -- Include components
      include_year BOOLEAN DEFAULT true,
      year_format VARCHAR(10) DEFAULT 'YY', -- 'YY' or 'YYYY'
      include_class BOOLEAN DEFAULT false,
      include_section BOOLEAN DEFAULT false,
      include_session BOOLEAN DEFAULT false,
      
      -- Reset configuration
      reset_yearly BOOLEAN DEFAULT true,
      reset_on_class_change BOOLEAN DEFAULT false,
      
      -- Roll number specific
      roll_number_type VARCHAR(20) DEFAULT 'sequential', -- 'sequential', 'alphabetical', 'custom'
      roll_per_class BOOLEAN DEFAULT true, -- Reset roll number per class
      
      -- Example format display
      example_format VARCHAR(100),
      
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      
      UNIQUE(school_id, setting_type)
    );

    -- Create index
    CREATE INDEX IF NOT EXISTS idx_number_settings_school 
    ON number_generation_settings(school_id, setting_type);
  `);

  // Insert default settings for the school
  await dbClient.query(`
    INSERT INTO number_generation_settings (school_id, setting_type, prefix, start_number, current_number, number_length, include_year, year_format, reset_yearly, example_format)
    VALUES 
      ($1, 'admission_number', 'ADM', 1, 0, 4, true, 'YY', true, 'ADM/25/0001'),
      ($1, 'roll_number', '', 1, 0, 2, false, '', false, '01')
    ON CONFLICT (school_id, setting_type) DO NOTHING
  `, [schoolId]);

  console.log('✅ Number generation settings table created');
};

export const down = async (dbClient) => {
  await dbClient.query(`DROP TABLE IF EXISTS number_generation_settings`);
  console.log('✅ Number generation settings table dropped');
};

