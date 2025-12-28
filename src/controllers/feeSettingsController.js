import { getGroupDbClient } from '../lib/groupDb.js';

// ==========================================
// RECEIPT TEMPLATES
// ==========================================

// Get all receipt templates
export const getReceiptTemplates = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      const result = await dbClient.query(`
        SELECT * FROM receipt_templates 
        WHERE school_id = $1 AND is_active = true
        ORDER BY is_default DESC, name
      `, [schoolId]);
      
      res.json({
        success: true,
        data: result.rows.map(t => formatTemplate(t))
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get receipt templates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch templates' });
  }
};

// Get single template
export const getReceiptTemplate = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      const result = await dbClient.query(`
        SELECT * FROM receipt_templates WHERE id = $1 AND school_id = $2
      `, [id, schoolId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      
      res.json({ success: true, data: formatTemplate(result.rows[0]) });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get receipt template error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch template' });
  }
};

// Get default template
export const getDefaultTemplate = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      let result = await dbClient.query(`
        SELECT * FROM receipt_templates 
        WHERE school_id = $1 AND is_default = true AND is_active = true
        LIMIT 1
      `, [schoolId]);
      
      // If no default, get any active template
      if (result.rows.length === 0) {
        result = await dbClient.query(`
          SELECT * FROM receipt_templates 
          WHERE school_id = $1 AND is_active = true
          ORDER BY created_at
          LIMIT 1
        `, [schoolId]);
      }
      
      // If still none, return default settings
      if (result.rows.length === 0) {
        return res.json({ success: true, data: getDefaultTemplateSettings() });
      }
      
      res.json({ success: true, data: formatTemplate(result.rows[0]) });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get default template error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch default template' });
  }
};

// Create template
export const createReceiptTemplate = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const template = req.body;
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      await dbClient.query('BEGIN');
      
      // If this is set as default, unset other defaults
      if (template.isDefault) {
        await dbClient.query(`
          UPDATE receipt_templates SET is_default = false WHERE school_id = $1
        `, [schoolId]);
      }
      
      const result = await dbClient.query(`
        INSERT INTO receipt_templates (
          school_id, name, is_default, is_active,
          paper_size, orientation,
          show_logo, logo_position, school_name_size, show_address, show_contact, header_color,
          receipt_title, show_receipt_number, receipt_prefix,
          show_student_photo, show_father_name, show_mother_name, show_phone, show_address_student, show_roll_number,
          show_period_column, show_category_column, table_header_color,
          show_amount_in_words, currency_symbol,
          footer_text, show_signature_line, signature_label, show_date_time, show_collected_by,
          primary_color, font_family, border_style,
          terms_text, show_terms
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36)
        RETURNING *
      `, [
        schoolId, template.name, template.isDefault || false, true,
        template.paperSize || 'a4', template.orientation || 'portrait',
        template.showLogo ?? true, template.logoPosition || 'left', template.schoolNameSize || 'large',
        template.showAddress ?? true, template.showContact ?? true, template.headerColor || '#1f2937',
        template.receiptTitle || 'Fee Receipt', template.showReceiptNumber ?? true, template.receiptPrefix || 'RCP',
        template.showStudentPhoto ?? false, template.showFatherName ?? true, template.showMotherName ?? false,
        template.showPhone ?? true, template.showAddressStudent ?? false, template.showRollNumber ?? false,
        template.showPeriodColumn ?? true, template.showCategoryColumn ?? false, template.tableHeaderColor || '#f3f4f6',
        template.showAmountInWords ?? true, template.currencySymbol || '₹',
        template.footerText || '', template.showSignatureLine ?? true, template.signatureLabel || 'Authorized Signature',
        template.showDateTime ?? true, template.showCollectedBy ?? true,
        template.primaryColor || '#059669', template.fontFamily || 'Arial', template.borderStyle || 'solid',
        template.termsText || '', template.showTerms ?? false
      ]);
      
      await dbClient.query('COMMIT');
      
      res.json({
        success: true,
        message: 'Template created successfully',
        data: formatTemplate(result.rows[0])
      });
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Create receipt template error:', error);
    res.status(500).json({ success: false, message: 'Failed to create template' });
  }
};

// Update template
export const updateReceiptTemplate = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const template = req.body;
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      await dbClient.query('BEGIN');
      
      // If this is set as default, unset other defaults
      if (template.isDefault) {
        await dbClient.query(`
          UPDATE receipt_templates SET is_default = false WHERE school_id = $1 AND id != $2
        `, [schoolId, id]);
      }
      
      const result = await dbClient.query(`
        UPDATE receipt_templates SET
          name = $1, is_default = $2,
          paper_size = $3, orientation = $4,
          show_logo = $5, logo_position = $6, school_name_size = $7, show_address = $8, show_contact = $9, header_color = $10,
          receipt_title = $11, show_receipt_number = $12, receipt_prefix = $13,
          show_student_photo = $14, show_father_name = $15, show_mother_name = $16, show_phone = $17, show_address_student = $18, show_roll_number = $19,
          show_period_column = $20, show_category_column = $21, table_header_color = $22,
          show_amount_in_words = $23, currency_symbol = $24,
          footer_text = $25, show_signature_line = $26, signature_label = $27, show_date_time = $28, show_collected_by = $29,
          primary_color = $30, font_family = $31, border_style = $32,
          terms_text = $33, show_terms = $34,
          updated_at = NOW()
        WHERE id = $35 AND school_id = $36
        RETURNING *
      `, [
        template.name, template.isDefault || false,
        template.paperSize || 'a4', template.orientation || 'portrait',
        template.showLogo ?? true, template.logoPosition || 'left', template.schoolNameSize || 'large',
        template.showAddress ?? true, template.showContact ?? true, template.headerColor || '#1f2937',
        template.receiptTitle || 'Fee Receipt', template.showReceiptNumber ?? true, template.receiptPrefix || 'RCP',
        template.showStudentPhoto ?? false, template.showFatherName ?? true, template.showMotherName ?? false,
        template.showPhone ?? true, template.showAddressStudent ?? false, template.showRollNumber ?? false,
        template.showPeriodColumn ?? true, template.showCategoryColumn ?? false, template.tableHeaderColor || '#f3f4f6',
        template.showAmountInWords ?? true, template.currencySymbol || '₹',
        template.footerText || '', template.showSignatureLine ?? true, template.signatureLabel || 'Authorized Signature',
        template.showDateTime ?? true, template.showCollectedBy ?? true,
        template.primaryColor || '#059669', template.fontFamily || 'Arial', template.borderStyle || 'solid',
        template.termsText || '', template.showTerms ?? false,
        id, schoolId
      ]);
      
      await dbClient.query('COMMIT');
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      
      res.json({
        success: true,
        message: 'Template updated successfully',
        data: formatTemplate(result.rows[0])
      });
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Update receipt template error:', error);
    res.status(500).json({ success: false, message: 'Failed to update template' });
  }
};

// Delete template
export const deleteReceiptTemplate = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      // Check if it's the only template
      const countResult = await dbClient.query(`
        SELECT COUNT(*) as count FROM receipt_templates WHERE school_id = $1 AND is_active = true
      `, [schoolId]);
      
      if (parseInt(countResult.rows[0].count) <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot delete the only template' });
      }
      
      // Soft delete
      await dbClient.query(`
        UPDATE receipt_templates SET is_active = false, updated_at = NOW() WHERE id = $1 AND school_id = $2
      `, [id, schoolId]);
      
      res.json({ success: true, message: 'Template deleted successfully' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Delete receipt template error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete template' });
  }
};

// Set default template
export const setDefaultTemplate = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      await dbClient.query('BEGIN');
      
      await dbClient.query(`
        UPDATE receipt_templates SET is_default = false WHERE school_id = $1
      `, [schoolId]);
      
      await dbClient.query(`
        UPDATE receipt_templates SET is_default = true, updated_at = NOW() WHERE id = $1 AND school_id = $2
      `, [id, schoolId]);
      
      await dbClient.query('COMMIT');
      
      res.json({ success: true, message: 'Default template updated' });
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Set default template error:', error);
    res.status(500).json({ success: false, message: 'Failed to set default template' });
  }
};

// Duplicate template
export const duplicateReceiptTemplate = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { name } = req.body;
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      const original = await dbClient.query(`
        SELECT * FROM receipt_templates WHERE id = $1 AND school_id = $2
      `, [id, schoolId]);
      
      if (original.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      
      const t = original.rows[0];
      
      const result = await dbClient.query(`
        INSERT INTO receipt_templates (
          school_id, name, is_default, is_active,
          paper_size, orientation,
          show_logo, logo_position, school_name_size, show_address, show_contact, header_color,
          receipt_title, show_receipt_number, receipt_prefix,
          show_student_photo, show_father_name, show_mother_name, show_phone, show_address_student, show_roll_number,
          show_period_column, show_category_column, table_header_color,
          show_amount_in_words, currency_symbol,
          footer_text, show_signature_line, signature_label, show_date_time, show_collected_by,
          primary_color, font_family, border_style,
          terms_text, show_terms
        ) VALUES ($1, $2, false, true, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34)
        RETURNING *
      `, [
        schoolId, name || `${t.name} (Copy)`,
        t.paper_size, t.orientation,
        t.show_logo, t.logo_position, t.school_name_size, t.show_address, t.show_contact, t.header_color,
        t.receipt_title, t.show_receipt_number, t.receipt_prefix,
        t.show_student_photo, t.show_father_name, t.show_mother_name, t.show_phone, t.show_address_student, t.show_roll_number,
        t.show_period_column, t.show_category_column, t.table_header_color,
        t.show_amount_in_words, t.currency_symbol,
        t.footer_text, t.show_signature_line, t.signature_label, t.show_date_time, t.show_collected_by,
        t.primary_color, t.font_family, t.border_style,
        t.terms_text, t.show_terms
      ]);
      
      res.json({
        success: true,
        message: 'Template duplicated successfully',
        data: formatTemplate(result.rows[0])
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Duplicate template error:', error);
    res.status(500).json({ success: false, message: 'Failed to duplicate template' });
  }
};

// Helper function to format template response
const formatTemplate = (t) => ({
  id: t.id,
  name: t.name,
  isDefault: t.is_default,
  isActive: t.is_active,
  paperSize: t.paper_size,
  orientation: t.orientation,
  showLogo: t.show_logo,
  logoPosition: t.logo_position,
  schoolNameSize: t.school_name_size,
  showAddress: t.show_address,
  showContact: t.show_contact,
  headerColor: t.header_color,
  receiptTitle: t.receipt_title,
  showReceiptNumber: t.show_receipt_number,
  receiptPrefix: t.receipt_prefix,
  showStudentPhoto: t.show_student_photo,
  showFatherName: t.show_father_name,
  showMotherName: t.show_mother_name,
  showPhone: t.show_phone,
  showAddressStudent: t.show_address_student,
  showRollNumber: t.show_roll_number,
  showPeriodColumn: t.show_period_column,
  showCategoryColumn: t.show_category_column,
  tableHeaderColor: t.table_header_color,
  showAmountInWords: t.show_amount_in_words,
  currencySymbol: t.currency_symbol,
  footerText: t.footer_text,
  showSignatureLine: t.show_signature_line,
  signatureLabel: t.signature_label,
  showDateTime: t.show_date_time,
  showCollectedBy: t.show_collected_by,
  primaryColor: t.primary_color,
  fontFamily: t.font_family,
  borderStyle: t.border_style,
  termsText: t.terms_text,
  showTerms: t.show_terms,
  createdAt: t.created_at,
  updatedAt: t.updated_at
});

const getDefaultTemplateSettings = () => ({
  id: null,
  name: 'Default',
  isDefault: true,
  paperSize: 'a4',
  orientation: 'portrait',
  showLogo: true,
  logoPosition: 'left',
  schoolNameSize: 'large',
  showAddress: true,
  showContact: true,
  headerColor: '#1f2937',
  receiptTitle: 'Fee Receipt',
  showReceiptNumber: true,
  receiptPrefix: 'RCP',
  showStudentPhoto: false,
  showFatherName: true,
  showMotherName: false,
  showPhone: true,
  showAddressStudent: false,
  showRollNumber: false,
  showPeriodColumn: true,
  showCategoryColumn: false,
  tableHeaderColor: '#f3f4f6',
  showAmountInWords: true,
  currencySymbol: '₹',
  footerText: 'This is a computer generated receipt. Thank you for your payment!',
  showSignatureLine: true,
  signatureLabel: 'Authorized Signature',
  showDateTime: true,
  showCollectedBy: true,
  primaryColor: '#059669',
  fontFamily: 'Arial',
  borderStyle: 'solid',
  termsText: '',
  showTerms: false
});

// ==========================================
// SCHOOL FEE SETTINGS
// ==========================================

// Get school fee settings
export const getFeeSettings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      const result = await dbClient.query(`
        SELECT * FROM fee_settings 
        WHERE school_id = $1 AND academic_session_id = $2
      `, [schoolId, academic_session_id]);
      
      // Return default settings if none exist
      const settings = result.rows[0] || {
        payment_frequency: 'monthly',
        due_day_of_month: 10,
        grace_period_days: 5,
        late_fee_enabled: true,
        late_fee_type: 'fixed',
        late_fee_amount: 0,
        late_fee_max_amount: null,
        early_payment_discount_enabled: false,
        early_payment_days: 5,
        early_payment_discount_type: 'percentage',
        early_payment_discount_amount: 0,
        partial_payment_allowed: true,
        minimum_partial_amount: null,
        carry_forward_dues: true,
        auto_generate_dues: false,
        auto_generate_day: 1,
        reminder_before_days: 7,
        reminder_enabled: false
      };
      
      res.json({
        success: true,
        data: {
          id: settings.id,
          paymentFrequency: settings.payment_frequency,
          dueDayOfMonth: settings.due_day_of_month,
          gracePeriodDays: settings.grace_period_days,
          lateFee: {
            enabled: settings.late_fee_enabled,
            type: settings.late_fee_type,
            amount: parseFloat(settings.late_fee_amount) || 0,
            maxAmount: settings.late_fee_max_amount ? parseFloat(settings.late_fee_max_amount) : null
          },
          earlyPaymentDiscount: {
            enabled: settings.early_payment_discount_enabled,
            days: settings.early_payment_days,
            type: settings.early_payment_discount_type,
            amount: parseFloat(settings.early_payment_discount_amount) || 0
          },
          paymentRules: {
            partialPaymentAllowed: settings.partial_payment_allowed,
            minimumPartialAmount: settings.minimum_partial_amount ? parseFloat(settings.minimum_partial_amount) : null,
            carryForwardDues: settings.carry_forward_dues
          },
          autoGeneration: {
            enabled: settings.auto_generate_dues,
            day: settings.auto_generate_day
          },
          reminders: {
            enabled: settings.reminder_enabled,
            daysBefore: settings.reminder_before_days
          }
        }
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get fee settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fee settings' });
  }
};

// Save school fee settings
export const saveFeeSettings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, settings } = req.body;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      // Upsert settings
      const result = await dbClient.query(`
        INSERT INTO fee_settings (
          school_id, academic_session_id, payment_frequency, due_day_of_month,
          grace_period_days, late_fee_enabled, late_fee_type, late_fee_amount,
          late_fee_max_amount, early_payment_discount_enabled, early_payment_days,
          early_payment_discount_type, early_payment_discount_amount, partial_payment_allowed,
          minimum_partial_amount, carry_forward_dues, auto_generate_dues, auto_generate_day,
          reminder_before_days, reminder_enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        ON CONFLICT (school_id, academic_session_id) DO UPDATE SET
          payment_frequency = EXCLUDED.payment_frequency,
          due_day_of_month = EXCLUDED.due_day_of_month,
          grace_period_days = EXCLUDED.grace_period_days,
          late_fee_enabled = EXCLUDED.late_fee_enabled,
          late_fee_type = EXCLUDED.late_fee_type,
          late_fee_amount = EXCLUDED.late_fee_amount,
          late_fee_max_amount = EXCLUDED.late_fee_max_amount,
          early_payment_discount_enabled = EXCLUDED.early_payment_discount_enabled,
          early_payment_days = EXCLUDED.early_payment_days,
          early_payment_discount_type = EXCLUDED.early_payment_discount_type,
          early_payment_discount_amount = EXCLUDED.early_payment_discount_amount,
          partial_payment_allowed = EXCLUDED.partial_payment_allowed,
          minimum_partial_amount = EXCLUDED.minimum_partial_amount,
          carry_forward_dues = EXCLUDED.carry_forward_dues,
          auto_generate_dues = EXCLUDED.auto_generate_dues,
          auto_generate_day = EXCLUDED.auto_generate_day,
          reminder_before_days = EXCLUDED.reminder_before_days,
          reminder_enabled = EXCLUDED.reminder_enabled,
          updated_at = NOW()
        RETURNING *
      `, [
        schoolId, academic_session_id,
        settings.paymentFrequency,
        settings.dueDayOfMonth,
        settings.gracePeriodDays,
        settings.lateFee?.enabled,
        settings.lateFee?.type,
        settings.lateFee?.amount,
        settings.lateFee?.maxAmount,
        settings.earlyPaymentDiscount?.enabled,
        settings.earlyPaymentDiscount?.days,
        settings.earlyPaymentDiscount?.type,
        settings.earlyPaymentDiscount?.amount,
        settings.paymentRules?.partialPaymentAllowed,
        settings.paymentRules?.minimumPartialAmount,
        settings.paymentRules?.carryForwardDues,
        settings.autoGeneration?.enabled,
        settings.autoGeneration?.day,
        settings.reminders?.daysBefore,
        settings.reminders?.enabled
      ]);
      
      res.json({
        success: true,
        message: 'Fee settings saved successfully',
        data: result.rows[0]
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Save fee settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to save fee settings' });
  }
};

// ==========================================
// CLASS-SPECIFIC FEE SETTINGS
// ==========================================

// Get all class fee settings
export const getClassFeeSettings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      const result = await dbClient.query(`
        SELECT 
          cfs.*,
          cg.display_name as class_name,
          cg.numeric_value
        FROM class_fee_settings cfs
        JOIN class_grades cg ON cfs.class_grade_id = cg.id
        WHERE cfs.school_id = $1 AND cfs.academic_session_id = $2
        ORDER BY cg.numeric_value
      `, [schoolId, academic_session_id]);
      
      res.json({
        success: true,
        data: result.rows.map(r => ({
          id: r.id,
          classGradeId: r.class_grade_id,
          className: r.class_name,
          numericValue: r.numeric_value,
          paymentFrequency: r.payment_frequency,
          dueDayOfMonth: r.due_day_of_month,
          gracePeriodDays: r.grace_period_days,
          lateFeeEnabled: r.late_fee_enabled,
          lateFeeType: r.late_fee_type,
          lateFeeAmount: r.late_fee_amount ? parseFloat(r.late_fee_amount) : null,
          earlyPaymentDiscountEnabled: r.early_payment_discount_enabled,
          earlyPaymentDays: r.early_payment_days,
          earlyPaymentDiscountAmount: r.early_payment_discount_amount ? parseFloat(r.early_payment_discount_amount) : null,
          isActive: r.is_active
        }))
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get class fee settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch class fee settings' });
  }
};

// Save class fee settings
export const saveClassFeeSettings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, class_grade_id, settings } = req.body;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      const result = await dbClient.query(`
        INSERT INTO class_fee_settings (
          school_id, academic_session_id, class_grade_id, payment_frequency,
          due_day_of_month, grace_period_days, late_fee_enabled, late_fee_type,
          late_fee_amount, early_payment_discount_enabled, early_payment_days,
          early_payment_discount_amount, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (school_id, academic_session_id, class_grade_id) DO UPDATE SET
          payment_frequency = EXCLUDED.payment_frequency,
          due_day_of_month = EXCLUDED.due_day_of_month,
          grace_period_days = EXCLUDED.grace_period_days,
          late_fee_enabled = EXCLUDED.late_fee_enabled,
          late_fee_type = EXCLUDED.late_fee_type,
          late_fee_amount = EXCLUDED.late_fee_amount,
          early_payment_discount_enabled = EXCLUDED.early_payment_discount_enabled,
          early_payment_days = EXCLUDED.early_payment_days,
          early_payment_discount_amount = EXCLUDED.early_payment_discount_amount,
          is_active = EXCLUDED.is_active,
          updated_at = NOW()
        RETURNING *
      `, [
        schoolId, academic_session_id, class_grade_id,
        settings.paymentFrequency,
        settings.dueDayOfMonth,
        settings.gracePeriodDays,
        settings.lateFeeEnabled,
        settings.lateFeeType,
        settings.lateFeeAmount,
        settings.earlyPaymentDiscountEnabled,
        settings.earlyPaymentDays,
        settings.earlyPaymentDiscountAmount,
        settings.isActive !== false
      ]);
      
      res.json({
        success: true,
        message: 'Class fee settings saved',
        data: result.rows[0]
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Save class fee settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to save class fee settings' });
  }
};

// Delete class fee settings (reset to school default)
export const deleteClassFeeSettings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      await dbClient.query(`
        DELETE FROM class_fee_settings WHERE id = $1 AND school_id = $2
      `, [id, schoolId]);
      
      res.json({ success: true, message: 'Class settings removed, will use school defaults' });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Delete class fee settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete class fee settings' });
  }
};

// ==========================================
// FEE INSTALLMENTS
// ==========================================

// Get fee installments
export const getFeeInstallments = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, fee_type_id, class_grade_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      let query = `
        SELECT 
          fi.*,
          ft.name as fee_type_name,
          cg.display_name as class_name
        FROM fee_installments fi
        JOIN fee_types ft ON fi.fee_type_id = ft.id
        LEFT JOIN class_grades cg ON fi.class_grade_id = cg.id
        WHERE fi.school_id = $1 AND fi.academic_session_id = $2
      `;
      const params = [schoolId, academic_session_id];
      
      if (fee_type_id) {
        params.push(fee_type_id);
        query += ` AND fi.fee_type_id = $${params.length}`;
      }
      
      if (class_grade_id) {
        params.push(class_grade_id);
        query += ` AND (fi.class_grade_id = $${params.length} OR fi.class_grade_id IS NULL)`;
      }
      
      query += ` ORDER BY fi.fee_type_id, fi.installment_number`;
      
      const result = await dbClient.query(query, params);
      
      res.json({
        success: true,
        data: result.rows.map(r => ({
          id: r.id,
          feeTypeId: r.fee_type_id,
          feeTypeName: r.fee_type_name,
          classGradeId: r.class_grade_id,
          className: r.class_name || 'All Classes',
          installmentName: r.installment_name,
          installmentNumber: r.installment_number,
          amountType: r.amount_type,
          amount: parseFloat(r.amount),
          dueDate: r.due_date,
          startDate: r.start_date,
          isActive: r.is_active
        }))
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get fee installments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fee installments' });
  }
};

// Create/Update fee installments
export const saveFeeInstallments = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, fee_type_id, class_grade_id, installments } = req.body;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      await dbClient.query('BEGIN');
      
      // Delete existing installments for this fee type/class
      await dbClient.query(`
        DELETE FROM fee_installments 
        WHERE school_id = $1 AND academic_session_id = $2 AND fee_type_id = $3
          AND (class_grade_id = $4 OR ($4 IS NULL AND class_grade_id IS NULL))
      `, [schoolId, academic_session_id, fee_type_id, class_grade_id]);
      
      // Insert new installments
      for (const inst of installments) {
        await dbClient.query(`
          INSERT INTO fee_installments (
            school_id, academic_session_id, fee_type_id, class_grade_id,
            installment_name, installment_number, amount_type, amount,
            due_date, start_date, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `, [
          schoolId, academic_session_id, fee_type_id, class_grade_id,
          inst.installmentName, inst.installmentNumber, inst.amountType,
          inst.amount, inst.dueDate, inst.startDate, inst.isActive !== false
        ]);
      }
      
      await dbClient.query('COMMIT');
      
      res.json({ success: true, message: 'Installments saved successfully' });
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Save fee installments error:', error);
    res.status(500).json({ success: false, message: 'Failed to save fee installments' });
  }
};

// ==========================================
// FEE CALENDAR
// ==========================================

// Get fee calendar
export const getFeeCalendar = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, class_grade_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      let query = `
        SELECT 
          fc.*,
          cg.display_name as class_name
        FROM fee_calendar fc
        LEFT JOIN class_grades cg ON fc.class_grade_id = cg.id
        WHERE fc.school_id = $1 AND fc.academic_session_id = $2
      `;
      const params = [schoolId, academic_session_id];
      
      if (class_grade_id) {
        params.push(class_grade_id);
        query += ` AND (fc.class_grade_id = $${params.length} OR fc.class_grade_id IS NULL)`;
      }
      
      query += ` ORDER BY fc.period_start`;
      
      const result = await dbClient.query(query, params);
      
      res.json({
        success: true,
        data: result.rows.map(r => ({
          id: r.id,
          classGradeId: r.class_grade_id,
          className: r.class_name || 'All Classes',
          periodName: r.period_name,
          periodType: r.period_type,
          periodStart: r.period_start,
          periodEnd: r.period_end,
          dueDate: r.due_date,
          lastDateWithoutFine: r.last_date_without_fine,
          lastDateWithFine: r.last_date_with_fine,
          isActive: r.is_active,
          isLocked: r.is_locked
        }))
      });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get fee calendar error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fee calendar' });
  }
};

// Generate fee calendar based on settings
export const generateFeeCalendar = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, class_grade_id } = req.body;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      // Get settings (class-specific or school default)
      let settingsResult;
      if (class_grade_id) {
        settingsResult = await dbClient.query(`
          SELECT * FROM class_fee_settings 
          WHERE school_id = $1 AND academic_session_id = $2 AND class_grade_id = $3
        `, [schoolId, academic_session_id, class_grade_id]);
      }
      
      if (!settingsResult?.rows[0]) {
        settingsResult = await dbClient.query(`
          SELECT * FROM fee_settings 
          WHERE school_id = $1 AND academic_session_id = $2
        `, [schoolId, academic_session_id]);
      }
      
      const settings = settingsResult.rows[0] || { payment_frequency: 'monthly', due_day_of_month: 10, grace_period_days: 5 };
      
      // Get academic session dates
      const sessionResult = await dbClient.query(`
        SELECT start_date, end_date FROM academic_sessions WHERE id = $1
      `, [academic_session_id]);
      
      if (!sessionResult.rows[0]) {
        return res.status(400).json({ success: false, message: 'Academic session not found' });
      }
      
      const { start_date, end_date } = sessionResult.rows[0];
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);
      
      await dbClient.query('BEGIN');
      
      // Delete existing calendar entries
      await dbClient.query(`
        DELETE FROM fee_calendar 
        WHERE school_id = $1 AND academic_session_id = $2 
          AND (class_grade_id = $3 OR ($3 IS NULL AND class_grade_id IS NULL))
          AND is_locked = false
      `, [schoolId, academic_session_id, class_grade_id]);
      
      // Generate calendar based on frequency
      const frequency = settings.payment_frequency || 'monthly';
      const dueDay = settings.due_day_of_month || 10;
      const graceDays = settings.grace_period_days || 5;
      
      const periods = [];
      let currentDate = new Date(startDate);
      
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];
      
      if (frequency === 'monthly') {
        while (currentDate <= endDate) {
          const periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
          const periodEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
          const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), dueDay);
          const lastWithoutFine = new Date(dueDate);
          lastWithoutFine.setDate(lastWithoutFine.getDate() + graceDays);
          
          periods.push({
            name: `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`,
            type: 'monthly',
            start: periodStart,
            end: periodEnd,
            due: dueDate,
            lastWithoutFine
          });
          
          currentDate.setMonth(currentDate.getMonth() + 1);
        }
      } else if (frequency === 'quarterly') {
        const quarters = [
          { name: 'Q1 (Apr-Jun)', months: [3, 4, 5] },
          { name: 'Q2 (Jul-Sep)', months: [6, 7, 8] },
          { name: 'Q3 (Oct-Dec)', months: [9, 10, 11] },
          { name: 'Q4 (Jan-Mar)', months: [0, 1, 2] }
        ];
        
        for (const q of quarters) {
          const qStart = new Date(startDate.getFullYear(), q.months[0], 1);
          if (qStart < startDate) qStart.setFullYear(qStart.getFullYear() + 1);
          if (qStart > endDate) continue;
          
          const qEnd = new Date(qStart.getFullYear(), q.months[2] + 1, 0);
          const dueDate = new Date(qStart.getFullYear(), q.months[0], dueDay);
          const lastWithoutFine = new Date(dueDate);
          lastWithoutFine.setDate(lastWithoutFine.getDate() + graceDays);
          
          periods.push({
            name: `${q.name} ${qStart.getFullYear()}`,
            type: 'quarterly',
            start: qStart,
            end: qEnd,
            due: dueDate,
            lastWithoutFine
          });
        }
      } else if (frequency === 'half_yearly') {
        const halves = [
          { name: 'First Half (Apr-Sep)', startMonth: 3, endMonth: 8 },
          { name: 'Second Half (Oct-Mar)', startMonth: 9, endMonth: 2 }
        ];
        
        for (const h of halves) {
          const hStart = new Date(startDate.getFullYear(), h.startMonth, 1);
          if (hStart < startDate && h.startMonth > startDate.getMonth()) continue;
          
          const hEnd = new Date(h.endMonth < h.startMonth ? startDate.getFullYear() + 1 : startDate.getFullYear(), h.endMonth + 1, 0);
          if (hStart > endDate) continue;
          
          const dueDate = new Date(hStart.getFullYear(), h.startMonth, dueDay);
          const lastWithoutFine = new Date(dueDate);
          lastWithoutFine.setDate(lastWithoutFine.getDate() + graceDays);
          
          periods.push({
            name: `${h.name} ${hStart.getFullYear()}`,
            type: 'half_yearly',
            start: hStart,
            end: hEnd,
            due: dueDate,
            lastWithoutFine
          });
        }
      } else if (frequency === 'yearly') {
        const dueDate = new Date(startDate.getFullYear(), startDate.getMonth(), dueDay);
        const lastWithoutFine = new Date(dueDate);
        lastWithoutFine.setDate(lastWithoutFine.getDate() + graceDays);
        
        periods.push({
          name: `Annual Fee ${startDate.getFullYear()}-${endDate.getFullYear()}`,
          type: 'yearly',
          start: startDate,
          end: endDate,
          due: dueDate,
          lastWithoutFine
        });
      }
      
      // Insert periods
      for (const p of periods) {
        await dbClient.query(`
          INSERT INTO fee_calendar (
            school_id, academic_session_id, class_grade_id, period_name,
            period_type, period_start, period_end, due_date, 
            last_date_without_fine, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
        `, [
          schoolId, academic_session_id, class_grade_id, p.name,
          p.type, p.start, p.end, p.due, p.lastWithoutFine
        ]);
      }
      
      await dbClient.query('COMMIT');
      
      res.json({ success: true, message: `Generated ${periods.length} fee periods` });
    } catch (e) {
      await dbClient.query('ROLLBACK');
      throw e;
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Generate fee calendar error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate fee calendar' });
  }
};

// Update fee calendar entry
export const updateFeeCalendar = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { dueDate, lastDateWithoutFine, lastDateWithFine, isActive } = req.body;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      const result = await dbClient.query(`
        UPDATE fee_calendar 
        SET due_date = COALESCE($1, due_date),
            last_date_without_fine = COALESCE($2, last_date_without_fine),
            last_date_with_fine = $3,
            is_active = COALESCE($4, is_active),
            updated_at = NOW()
        WHERE id = $5 AND school_id = $6 AND is_locked = false
        RETURNING *
      `, [dueDate, lastDateWithoutFine, lastDateWithFine, isActive, id, schoolId]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Calendar entry not found or is locked' });
      }
      
      res.json({ success: true, message: 'Calendar updated', data: result.rows[0] });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Update fee calendar error:', error);
    res.status(500).json({ success: false, message: 'Failed to update fee calendar' });
  }
};

// Get effective settings for a class (merged with school defaults)
export const getEffectiveSettings = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { academic_session_id, class_grade_id } = req.query;
    
    const dbClient = await getGroupDbClient(groupId);
    
    try {
      // Get school defaults
      const schoolSettings = await dbClient.query(`
        SELECT * FROM fee_settings 
        WHERE school_id = $1 AND academic_session_id = $2
      `, [schoolId, academic_session_id]);
      
      const defaults = schoolSettings.rows[0] || {};
      
      // Get class overrides if class_grade_id is provided
      let classOverrides = {};
      if (class_grade_id) {
        const classSettings = await dbClient.query(`
          SELECT * FROM class_fee_settings 
          WHERE school_id = $1 AND academic_session_id = $2 AND class_grade_id = $3
        `, [schoolId, academic_session_id, class_grade_id]);
        classOverrides = classSettings.rows[0] || {};
      }
      
      // Merge settings (class overrides take precedence)
      const effective = {
        paymentFrequency: classOverrides.payment_frequency || defaults.payment_frequency || 'monthly',
        dueDayOfMonth: classOverrides.due_day_of_month || defaults.due_day_of_month || 10,
        gracePeriodDays: classOverrides.grace_period_days || defaults.grace_period_days || 5,
        lateFeeEnabled: classOverrides.late_fee_enabled ?? defaults.late_fee_enabled ?? true,
        lateFeeType: classOverrides.late_fee_type || defaults.late_fee_type || 'fixed',
        lateFeeAmount: parseFloat(classOverrides.late_fee_amount || defaults.late_fee_amount || 0),
        earlyPaymentDiscountEnabled: classOverrides.early_payment_discount_enabled ?? defaults.early_payment_discount_enabled ?? false,
        earlyPaymentDays: classOverrides.early_payment_days || defaults.early_payment_days || 5,
        earlyPaymentDiscountAmount: parseFloat(classOverrides.early_payment_discount_amount || defaults.early_payment_discount_amount || 0),
        partialPaymentAllowed: defaults.partial_payment_allowed ?? true,
        carryForwardDues: defaults.carry_forward_dues ?? true,
        isClassOverride: Object.keys(classOverrides).length > 0
      };
      
      res.json({ success: true, data: effective });
    } finally {
      await dbClient.end();
    }
  } catch (error) {
    console.error('Get effective settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to get effective settings' });
  }
};

