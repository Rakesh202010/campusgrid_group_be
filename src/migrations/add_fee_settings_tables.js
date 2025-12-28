// Migration to add enhanced fee settings tables
export const up = async (db) => {
  // School Fee Settings - Global settings for the school
  await db.query(`
    CREATE TABLE IF NOT EXISTS fee_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      academic_session_id UUID REFERENCES academic_sessions(id),
      
      -- Payment Frequency (default for school)
      payment_frequency VARCHAR(20) DEFAULT 'monthly', -- monthly, quarterly, half_yearly, yearly
      
      -- Due Date Settings
      due_day_of_month INT DEFAULT 10, -- Day of month when fee is due
      grace_period_days INT DEFAULT 5, -- Grace period after due date
      
      -- Late Fee Settings
      late_fee_enabled BOOLEAN DEFAULT true,
      late_fee_type VARCHAR(20) DEFAULT 'fixed', -- fixed, percentage, daily
      late_fee_amount DECIMAL(10,2) DEFAULT 0, -- Fixed amount or percentage
      late_fee_max_amount DECIMAL(10,2), -- Maximum late fee cap
      
      -- Early Payment Discount
      early_payment_discount_enabled BOOLEAN DEFAULT false,
      early_payment_days INT DEFAULT 5, -- Days before due date
      early_payment_discount_type VARCHAR(20) DEFAULT 'percentage', -- fixed, percentage
      early_payment_discount_amount DECIMAL(10,2) DEFAULT 0,
      
      -- Payment Rules
      partial_payment_allowed BOOLEAN DEFAULT true,
      minimum_partial_amount DECIMAL(10,2), -- Minimum partial payment amount
      carry_forward_dues BOOLEAN DEFAULT true, -- Carry forward unpaid dues
      
      -- Auto Generation
      auto_generate_dues BOOLEAN DEFAULT false,
      auto_generate_day INT DEFAULT 1, -- Day of month to auto-generate
      
      -- Reminders
      reminder_before_days INT DEFAULT 7, -- Days before due date to send reminder
      reminder_enabled BOOLEAN DEFAULT false,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(school_id, academic_session_id)
    );
  `);

  -- Class-specific Fee Settings (overrides school settings)
  await db.query(`
    CREATE TABLE IF NOT EXISTS class_fee_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      academic_session_id UUID REFERENCES academic_sessions(id),
      class_grade_id UUID NOT NULL REFERENCES class_grades(id) ON DELETE CASCADE,
      
      -- Payment Frequency Override
      payment_frequency VARCHAR(20), -- monthly, quarterly, half_yearly, yearly (null = use school default)
      
      -- Due Date Override
      due_day_of_month INT,
      grace_period_days INT,
      
      -- Late Fee Override
      late_fee_enabled BOOLEAN,
      late_fee_type VARCHAR(20),
      late_fee_amount DECIMAL(10,2),
      
      -- Early Payment Discount Override
      early_payment_discount_enabled BOOLEAN,
      early_payment_days INT,
      early_payment_discount_amount DECIMAL(10,2),
      
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(school_id, academic_session_id, class_grade_id)
    );
  `);

  -- Fee Installments - Define installment schedules
  await db.query(`
    CREATE TABLE IF NOT EXISTS fee_installments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      academic_session_id UUID REFERENCES academic_sessions(id),
      fee_type_id UUID NOT NULL REFERENCES fee_types(id) ON DELETE CASCADE,
      class_grade_id UUID REFERENCES class_grades(id) ON DELETE CASCADE, -- null = all classes
      
      -- Installment Details
      installment_name VARCHAR(100) NOT NULL, -- e.g., "Q1", "April", "Term 1"
      installment_number INT NOT NULL, -- Order of installment
      
      -- Amount (can be percentage or fixed)
      amount_type VARCHAR(20) DEFAULT 'percentage', -- percentage, fixed
      amount DECIMAL(10,2) NOT NULL, -- Percentage (e.g., 25 for 25%) or fixed amount
      
      -- Due Date
      due_date DATE,
      start_date DATE, -- When this installment becomes payable
      
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  -- Fee Calendar - Shows fee schedule for the year
  await db.query(`
    CREATE TABLE IF NOT EXISTS fee_calendar (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      academic_session_id UUID REFERENCES academic_sessions(id),
      class_grade_id UUID REFERENCES class_grades(id), -- null = all classes
      
      -- Period Info
      period_name VARCHAR(50) NOT NULL, -- "April 2025", "Q1", "Term 1"
      period_type VARCHAR(20) NOT NULL, -- monthly, quarterly, half_yearly, yearly
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      
      -- Due Dates
      due_date DATE NOT NULL,
      last_date_without_fine DATE,
      last_date_with_fine DATE,
      
      -- Status
      is_active BOOLEAN DEFAULT true,
      is_locked BOOLEAN DEFAULT false, -- Cannot modify after locked
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  -- Create indexes
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_fee_settings_school ON fee_settings(school_id);
    CREATE INDEX IF NOT EXISTS idx_class_fee_settings_school ON class_fee_settings(school_id, class_grade_id);
    CREATE INDEX IF NOT EXISTS idx_fee_installments_school ON fee_installments(school_id, fee_type_id);
    CREATE INDEX IF NOT EXISTS idx_fee_calendar_school ON fee_calendar(school_id, academic_session_id);
  `);
};

export const down = async (db) => {
  await db.query(`DROP TABLE IF EXISTS fee_calendar;`);
  await db.query(`DROP TABLE IF EXISTS fee_installments;`);
  await db.query(`DROP TABLE IF EXISTS class_fee_settings;`);
  await db.query(`DROP TABLE IF EXISTS fee_settings;`);
};

