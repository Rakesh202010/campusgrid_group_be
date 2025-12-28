import { getGroupDbClient } from '../lib/groupDb.js';

// =====================================================
// FEE TYPES CRUD
// =====================================================

export const getFeeTypes = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { category, is_active } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT * FROM fee_types WHERE school_id = $1
      `;
      const params = [schoolId];
      let paramIndex = 2;

      if (category) {
        query += ` AND category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (is_active !== undefined) {
        query += ` AND is_active = $${paramIndex}`;
        params.push(is_active === 'true');
      }

      query += ` ORDER BY order_index ASC, name ASC`;

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          code: row.code,
          description: row.description,
          category: row.category,
          frequency: row.frequency,
          applicabilityType: row.applicability_type || 'full_year',
          applicableMonths: row.applicable_months || [],
          applicableTerms: row.applicable_terms || [],
          isProratedOnJoin: row.is_prorated_on_join || false,
          prorationtype: row.proration_type || 'month',
          isMandatory: row.is_mandatory,
          isRefundable: row.is_refundable,
          taxApplicable: row.tax_applicable,
          taxPercentage: parseFloat(row.tax_percentage) || 0,
          lateFeeApplicable: row.late_fee_applicable,
          lateFeeType: row.late_fee_type,
          lateFeeValue: parseFloat(row.late_fee_value) || 0,
          orderIndex: row.order_index,
          isActive: row.is_active,
          createdAt: row.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get fee types error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fee types', error: error.message });
  }
};

export const createFeeType = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { 
      name, code, description, category, frequency, isMandatory, isRefundable,
      taxApplicable, taxPercentage, lateFeeApplicable, lateFeeType, lateFeeValue,
      applicabilityType, applicableMonths, applicableTerms, isProratedOnJoin, prorationtype,
      orderIndex, isActive 
    } = req.body;

    if (!name || !code) {
      return res.status(400).json({ success: false, message: 'Name and code are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const existingResult = await dbClient.query(
        `SELECT id FROM fee_types WHERE school_id = $1 AND code = $2`,
        [schoolId, code]
      );

      if (existingResult.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'A fee type with this code already exists' });
      }

      const result = await dbClient.query(
        `INSERT INTO fee_types (
          name, code, description, category, frequency, is_mandatory, is_refundable,
          tax_applicable, tax_percentage, late_fee_applicable, late_fee_type, late_fee_value,
          applicability_type, applicable_months, applicable_terms, is_prorated_on_join, proration_type,
          order_index, is_active, school_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *`,
        [
          name, code, description, category || 'academic', frequency || 'monthly',
          isMandatory !== false, isRefundable || false, taxApplicable || false,
          taxPercentage || 0, lateFeeApplicable || false, lateFeeType || 'fixed',
          lateFeeValue || 0, applicabilityType || 'full_year',
          JSON.stringify(applicableMonths || []), JSON.stringify(applicableTerms || []),
          isProratedOnJoin || false, prorationtype || 'month',
          orderIndex || 0, isActive !== false, schoolId
        ]
      );

      const row = result.rows[0];
      res.status(201).json({
        success: true,
        message: 'Fee type created successfully',
        data: {
          id: row.id,
          name: row.name,
          code: row.code,
          category: row.category,
          frequency: row.frequency,
          applicabilityType: row.applicability_type,
          isActive: row.is_active
        }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create fee type error:', error);
    res.status(500).json({ success: false, message: 'Failed to create fee type', error: error.message });
  }
};

export const updateFeeType = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `UPDATE fee_types SET
          name = COALESCE($1, name),
          code = COALESCE($2, code),
          description = COALESCE($3, description),
          category = COALESCE($4, category),
          frequency = COALESCE($5, frequency),
          is_mandatory = COALESCE($6, is_mandatory),
          is_refundable = COALESCE($7, is_refundable),
          tax_applicable = COALESCE($8, tax_applicable),
          tax_percentage = COALESCE($9, tax_percentage),
          late_fee_applicable = COALESCE($10, late_fee_applicable),
          late_fee_type = COALESCE($11, late_fee_type),
          late_fee_value = COALESCE($12, late_fee_value),
          applicability_type = COALESCE($13, applicability_type),
          applicable_months = COALESCE($14, applicable_months),
          applicable_terms = COALESCE($15, applicable_terms),
          is_prorated_on_join = COALESCE($16, is_prorated_on_join),
          proration_type = COALESCE($17, proration_type),
          order_index = COALESCE($18, order_index),
          is_active = COALESCE($19, is_active),
          updated_at = NOW()
        WHERE id = $20 AND school_id = $21
        RETURNING *`,
        [
          updates.name, updates.code, updates.description, updates.category,
          updates.frequency, updates.isMandatory, updates.isRefundable,
          updates.taxApplicable, updates.taxPercentage, updates.lateFeeApplicable,
          updates.lateFeeType, updates.lateFeeValue, updates.applicabilityType,
          updates.applicableMonths ? JSON.stringify(updates.applicableMonths) : null,
          updates.applicableTerms ? JSON.stringify(updates.applicableTerms) : null,
          updates.isProratedOnJoin, updates.prorationtype,
          updates.orderIndex, updates.isActive, id, schoolId
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Fee type not found' });
      }

      res.json({ success: true, message: 'Fee type updated successfully', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update fee type error:', error);
    res.status(500).json({ success: false, message: 'Failed to update fee type', error: error.message });
  }
};

export const deleteFeeType = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM fee_types WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Fee type not found' });
      }

      res.json({ success: true, message: 'Fee type deleted successfully' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete fee type error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete fee type', error: error.message });
  }
};

export const bulkCreateFeeTypes = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { feeTypes } = req.body;

    if (!feeTypes || !Array.isArray(feeTypes)) {
      return res.status(400).json({ success: false, message: 'Fee types list is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let created = 0, skipped = 0;

      for (const ft of feeTypes) {
        const existing = await dbClient.query(
          `SELECT id FROM fee_types WHERE school_id = $1 AND code = $2`,
          [schoolId, ft.code]
        );

        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        await dbClient.query(
          `INSERT INTO fee_types (name, code, category, frequency, is_mandatory, order_index, school_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [ft.name, ft.code, ft.category || 'academic', ft.frequency || 'monthly', 
           ft.isMandatory !== false, created, schoolId]
        );
        created++;
      }

      res.status(201).json({
        success: true,
        message: `Created ${created} fee types, skipped ${skipped} (already exist)`,
        data: { created, skipped }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Bulk create fee types error:', error);
    res.status(500).json({ success: false, message: 'Failed to create fee types', error: error.message });
  }
};


// =====================================================
// FEE STRUCTURES CRUD
// =====================================================

export const getFeeStructures = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { fee_type_id, class_grade_id, academic_session_id } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `
        SELECT fs.*, 
          ft.name as fee_type_name, ft.code as fee_type_code, ft.category as fee_type_category,
          ft.frequency as fee_type_frequency,
          cg.name as class_name, cg.display_name as class_display_name, cg.numeric_value,
          acs.name as session_name, acs.code as session_code
        FROM fee_structures fs
        INNER JOIN fee_types ft ON fs.fee_type_id = ft.id
        LEFT JOIN class_grades cg ON fs.class_grade_id = cg.id
        LEFT JOIN academic_sessions acs ON fs.academic_session_id = acs.id
        WHERE fs.school_id = $1
      `;
      const params = [schoolId];
      let paramIndex = 2;

      if (fee_type_id) {
        query += ` AND fs.fee_type_id = $${paramIndex}`;
        params.push(fee_type_id);
        paramIndex++;
      }

      if (class_grade_id) {
        query += ` AND fs.class_grade_id = $${paramIndex}`;
        params.push(class_grade_id);
        paramIndex++;
      }

      if (academic_session_id) {
        query += ` AND fs.academic_session_id = $${paramIndex}`;
        params.push(academic_session_id);
        paramIndex++;
      }

      query += ` ORDER BY ft.order_index ASC, cg.order_index ASC`;

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          feeTypeId: row.fee_type_id,
          feeTypeName: row.fee_type_name,
          feeTypeCode: row.fee_type_code,
          feeTypeCategory: row.fee_type_category,
          feeTypeFrequency: row.fee_type_frequency,
          classGradeId: row.class_grade_id,
          className: row.class_name,
          classDisplayName: row.class_display_name,
          numericValue: row.numeric_value,
          academicSessionId: row.academic_session_id,
          sessionName: row.session_name,
          sessionCode: row.session_code,
          amount: parseFloat(row.amount),
          dueDay: row.due_day,
          applicableMonths: row.applicable_months,
          notes: row.notes,
          isActive: row.is_active,
          createdAt: row.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get fee structures error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch fee structures', error: error.message });
  }
};

export const createFeeStructure = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { feeTypeId, classGradeId, academicSessionId, amount, dueDay, applicableMonths, notes, isActive } = req.body;

    if (!feeTypeId || !amount) {
      return res.status(400).json({ success: false, message: 'Fee type and amount are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      // Check for duplicate
      const existing = await dbClient.query(
        `SELECT id FROM fee_structures 
         WHERE fee_type_id = $1 AND class_grade_id = $2 AND academic_session_id = $3`,
        [feeTypeId, classGradeId || null, academicSessionId || null]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Fee structure already exists for this combination' });
      }

      const result = await dbClient.query(
        `INSERT INTO fee_structures (
          fee_type_id, class_grade_id, academic_session_id, amount, due_day,
          applicable_months, notes, is_active, school_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          feeTypeId, classGradeId, academicSessionId, amount, dueDay || 10,
          JSON.stringify(applicableMonths || []), notes, isActive !== false, schoolId
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Fee structure created successfully',
        data: result.rows[0]
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create fee structure error:', error);
    res.status(500).json({ success: false, message: 'Failed to create fee structure', error: error.message });
  }
};

export const updateFeeStructure = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const { amount, dueDay, applicableMonths, notes, isActive } = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `UPDATE fee_structures SET
          amount = COALESCE($1, amount),
          due_day = COALESCE($2, due_day),
          applicable_months = COALESCE($3, applicable_months),
          notes = COALESCE($4, notes),
          is_active = COALESCE($5, is_active),
          updated_at = NOW()
        WHERE id = $6 AND school_id = $7
        RETURNING *`,
        [amount, dueDay, applicableMonths ? JSON.stringify(applicableMonths) : null, notes, isActive, id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Fee structure not found' });
      }

      res.json({ success: true, message: 'Fee structure updated successfully', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update fee structure error:', error);
    res.status(500).json({ success: false, message: 'Failed to update fee structure', error: error.message });
  }
};

export const deleteFeeStructure = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM fee_structures WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Fee structure not found' });
      }

      res.json({ success: true, message: 'Fee structure deleted successfully' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete fee structure error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete fee structure', error: error.message });
  }
};

export const bulkCreateFeeStructures = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { feeTypeId, classGradeIds, academicSessionId, amount, dueDay } = req.body;

    if (!feeTypeId || !classGradeIds || !Array.isArray(classGradeIds) || !amount) {
      return res.status(400).json({ success: false, message: 'Fee type, class grades, and amount are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let created = 0, skipped = 0;

      for (const classGradeId of classGradeIds) {
        const existing = await dbClient.query(
          `SELECT id FROM fee_structures 
           WHERE fee_type_id = $1 AND class_grade_id = $2 AND academic_session_id = $3`,
          [feeTypeId, classGradeId, academicSessionId || null]
        );

        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        await dbClient.query(
          `INSERT INTO fee_structures (fee_type_id, class_grade_id, academic_session_id, amount, due_day, school_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [feeTypeId, classGradeId, academicSessionId, amount, dueDay || 10, schoolId]
        );
        created++;
      }

      res.status(201).json({
        success: true,
        message: `Created ${created} fee structures, skipped ${skipped} (already exist)`,
        data: { created, skipped }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Bulk create fee structures error:', error);
    res.status(500).json({ success: false, message: 'Failed to create fee structures', error: error.message });
  }
};


// =====================================================
// DISCOUNT TYPES CRUD
// =====================================================

export const getDiscountTypes = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { is_active } = req.query;

    const dbClient = await getGroupDbClient(groupId);

    try {
      let query = `SELECT * FROM discount_types WHERE school_id = $1`;
      const params = [schoolId];

      if (is_active !== undefined) {
        query += ` AND is_active = $2`;
        params.push(is_active === 'true');
      }

      query += ` ORDER BY order_index ASC, name ASC`;

      const result = await dbClient.query(query, params);

      res.json({
        success: true,
        data: result.rows.map(row => ({
          id: row.id,
          name: row.name,
          code: row.code,
          description: row.description,
          discountType: row.discount_type,
          discountValue: parseFloat(row.discount_value),
          maxDiscountAmount: row.max_discount_amount ? parseFloat(row.max_discount_amount) : null,
          applicableFeeTypes: row.applicable_fee_types,
          eligibilityCriteria: row.eligibility_criteria,
          requiresApproval: row.requires_approval,
          isStackable: row.is_stackable,
          validFrom: row.valid_from,
          validUntil: row.valid_until,
          orderIndex: row.order_index,
          isActive: row.is_active,
          createdAt: row.created_at
        }))
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Get discount types error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch discount types', error: error.message });
  }
};

export const createDiscountType = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { 
      name, code, description, discountType, discountValue, maxDiscountAmount,
      applicableFeeTypes, eligibilityCriteria, requiresApproval, isStackable,
      validFrom, validUntil, orderIndex, isActive 
    } = req.body;

    if (!name || !code || discountValue === undefined) {
      return res.status(400).json({ success: false, message: 'Name, code, and discount value are required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      const existing = await dbClient.query(
        `SELECT id FROM discount_types WHERE school_id = $1 AND code = $2`,
        [schoolId, code]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'A discount with this code already exists' });
      }

      const result = await dbClient.query(
        `INSERT INTO discount_types (
          name, code, description, discount_type, discount_value, max_discount_amount,
          applicable_fee_types, eligibility_criteria, requires_approval, is_stackable,
          valid_from, valid_until, order_index, is_active, school_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          name, code, description, discountType || 'percentage', discountValue, maxDiscountAmount,
          JSON.stringify(applicableFeeTypes || []), eligibilityCriteria, requiresApproval || false,
          isStackable || false, validFrom, validUntil, orderIndex || 0, isActive !== false, schoolId
        ]
      );

      res.status(201).json({
        success: true,
        message: 'Discount type created successfully',
        data: result.rows[0]
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Create discount type error:', error);
    res.status(500).json({ success: false, message: 'Failed to create discount type', error: error.message });
  }
};

export const updateDiscountType = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `UPDATE discount_types SET
          name = COALESCE($1, name),
          code = COALESCE($2, code),
          description = COALESCE($3, description),
          discount_type = COALESCE($4, discount_type),
          discount_value = COALESCE($5, discount_value),
          max_discount_amount = COALESCE($6, max_discount_amount),
          applicable_fee_types = COALESCE($7, applicable_fee_types),
          eligibility_criteria = COALESCE($8, eligibility_criteria),
          requires_approval = COALESCE($9, requires_approval),
          is_stackable = COALESCE($10, is_stackable),
          valid_from = COALESCE($11, valid_from),
          valid_until = COALESCE($12, valid_until),
          order_index = COALESCE($13, order_index),
          is_active = COALESCE($14, is_active),
          updated_at = NOW()
        WHERE id = $15 AND school_id = $16
        RETURNING *`,
        [
          updates.name, updates.code, updates.description, updates.discountType,
          updates.discountValue, updates.maxDiscountAmount,
          updates.applicableFeeTypes ? JSON.stringify(updates.applicableFeeTypes) : null,
          updates.eligibilityCriteria, updates.requiresApproval, updates.isStackable,
          updates.validFrom, updates.validUntil, updates.orderIndex, updates.isActive, id, schoolId
        ]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Discount type not found' });
      }

      res.json({ success: true, message: 'Discount type updated successfully', data: result.rows[0] });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Update discount type error:', error);
    res.status(500).json({ success: false, message: 'Failed to update discount type', error: error.message });
  }
};

export const deleteDiscountType = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { id } = req.params;

    const dbClient = await getGroupDbClient(groupId);

    try {
      const result = await dbClient.query(
        `DELETE FROM discount_types WHERE id = $1 AND school_id = $2 RETURNING id`,
        [id, schoolId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Discount type not found' });
      }

      res.json({ success: true, message: 'Discount type deleted successfully' });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Delete discount type error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete discount type', error: error.message });
  }
};

export const bulkCreateDiscountTypes = async (req, res) => {
  try {
    const { groupId, schoolId } = req.user;
    const { discounts } = req.body;

    if (!discounts || !Array.isArray(discounts)) {
      return res.status(400).json({ success: false, message: 'Discounts list is required' });
    }

    const dbClient = await getGroupDbClient(groupId);

    try {
      let created = 0, skipped = 0;

      for (const d of discounts) {
        const existing = await dbClient.query(
          `SELECT id FROM discount_types WHERE school_id = $1 AND code = $2`,
          [schoolId, d.code]
        );

        if (existing.rows.length > 0) {
          skipped++;
          continue;
        }

        await dbClient.query(
          `INSERT INTO discount_types (name, code, discount_type, discount_value, order_index, school_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [d.name, d.code, d.discountType || 'percentage', d.discountValue, created, schoolId]
        );
        created++;
      }

      res.status(201).json({
        success: true,
        message: `Created ${created} discount types, skipped ${skipped} (already exist)`,
        data: { created, skipped }
      });

    } finally {
      await dbClient.end();
    }

  } catch (error) {
    console.error('Bulk create discount types error:', error);
    res.status(500).json({ success: false, message: 'Failed to create discount types', error: error.message });
  }
};

