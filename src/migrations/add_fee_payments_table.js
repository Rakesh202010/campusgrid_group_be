// Migration to add fee payments and related tables
export const up = async (db) => {
  // Fee Payments Table - stores all fee payments
  await db.query(`
    CREATE TABLE IF NOT EXISTS fee_payments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      academic_session_id UUID REFERENCES academic_sessions(id),
      
      -- Payment details
      receipt_number VARCHAR(50) NOT NULL,
      payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
      payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash', -- cash, cheque, online, bank_transfer
      total_amount DECIMAL(12,2) NOT NULL,
      discount_amount DECIMAL(12,2) DEFAULT 0,
      fine_amount DECIMAL(12,2) DEFAULT 0,
      net_amount DECIMAL(12,2) NOT NULL,
      
      -- Payment status
      status VARCHAR(20) DEFAULT 'completed', -- completed, cancelled, refunded
      
      -- Additional details
      remarks TEXT,
      collected_by UUID REFERENCES school_admins(id),
      cancelled_by UUID,
      cancelled_at TIMESTAMP,
      cancellation_reason TEXT,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(school_id, receipt_number)
    );
  `);

  // Fee Payment Items - individual fee items in a payment
  await db.query(`
    CREATE TABLE IF NOT EXISTS fee_payment_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      payment_id UUID NOT NULL REFERENCES fee_payments(id) ON DELETE CASCADE,
      fee_type_id UUID NOT NULL REFERENCES fee_types(id),
      fee_structure_id UUID REFERENCES fee_structures(id),
      
      -- Amount details
      amount DECIMAL(12,2) NOT NULL,
      discount_amount DECIMAL(12,2) DEFAULT 0,
      fine_amount DECIMAL(12,2) DEFAULT 0,
      net_amount DECIMAL(12,2) NOT NULL,
      
      -- Period (for monthly/term fees)
      fee_month VARCHAR(20), -- e.g., 'April 2025', 'Term 1'
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Student Fee Dues - tracks pending fees for each student
  await db.query(`
    CREATE TABLE IF NOT EXISTS student_fee_dues (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      academic_session_id UUID REFERENCES academic_sessions(id),
      fee_type_id UUID NOT NULL REFERENCES fee_types(id),
      fee_structure_id UUID REFERENCES fee_structures(id),
      
      -- Due details
      due_month VARCHAR(20), -- For monthly fees
      due_date DATE,
      amount DECIMAL(12,2) NOT NULL,
      paid_amount DECIMAL(12,2) DEFAULT 0,
      discount_amount DECIMAL(12,2) DEFAULT 0,
      fine_amount DECIMAL(12,2) DEFAULT 0,
      balance DECIMAL(12,2) NOT NULL,
      
      -- Status
      status VARCHAR(20) DEFAULT 'pending', -- pending, partial, paid, waived
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(student_id, fee_type_id, academic_session_id, due_month)
    );
  `);

  // Receipt Number Sequence
  await db.query(`
    CREATE TABLE IF NOT EXISTS receipt_sequences (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      academic_session_id UUID REFERENCES academic_sessions(id),
      prefix VARCHAR(10) DEFAULT 'RCP',
      current_number INT DEFAULT 0,
      
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      
      UNIQUE(school_id, academic_session_id)
    );
  `);

  // Create indexes
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_fee_payments_student ON fee_payments(student_id);
    CREATE INDEX IF NOT EXISTS idx_fee_payments_session ON fee_payments(academic_session_id);
    CREATE INDEX IF NOT EXISTS idx_fee_payments_date ON fee_payments(payment_date);
    CREATE INDEX IF NOT EXISTS idx_fee_payments_status ON fee_payments(status);
    CREATE INDEX IF NOT EXISTS idx_fee_payment_items_payment ON fee_payment_items(payment_id);
    CREATE INDEX IF NOT EXISTS idx_student_fee_dues_student ON student_fee_dues(student_id);
    CREATE INDEX IF NOT EXISTS idx_student_fee_dues_status ON student_fee_dues(status);
  `);
};

export const down = async (db) => {
  await db.query(`DROP TABLE IF EXISTS fee_payment_items;`);
  await db.query(`DROP TABLE IF EXISTS fee_payments;`);
  await db.query(`DROP TABLE IF EXISTS student_fee_dues;`);
  await db.query(`DROP TABLE IF EXISTS receipt_sequences;`);
};

