import { getGroupDbClient } from '../lib/groupDb.js';

// Default field configurations for different user types
const DEFAULT_STUDENT_FIELDS = [
  { field: 'name', label: 'Name', show: true, fontSize: 14, fontWeight: 'bold', order: 1 },
  { field: 'admissionNumber', label: 'Admission No', show: true, fontSize: 12, fontWeight: 'normal', order: 2 },
  { field: 'class', label: 'Class', show: true, fontSize: 12, fontWeight: 'normal', order: 3 },
  { field: 'section', label: 'Section', show: true, fontSize: 12, fontWeight: 'normal', order: 4 },
  { field: 'rollNumber', label: 'Roll No', show: true, fontSize: 12, fontWeight: 'normal', order: 5 },
  { field: 'dateOfBirth', label: 'DOB', show: true, fontSize: 11, fontWeight: 'normal', order: 6 },
  { field: 'bloodGroup', label: 'Blood Group', show: true, fontSize: 11, fontWeight: 'normal', order: 7 },
  { field: 'fatherName', label: "Father's Name", show: true, fontSize: 11, fontWeight: 'normal', order: 8 },
  { field: 'motherName', label: "Mother's Name", show: false, fontSize: 11, fontWeight: 'normal', order: 9 },
  { field: 'contactNumber', label: 'Contact', show: true, fontSize: 11, fontWeight: 'normal', order: 10 },
  { field: 'address', label: 'Address', show: false, fontSize: 10, fontWeight: 'normal', order: 11 },
  { field: 'emergencyContact', label: 'Emergency', show: false, fontSize: 10, fontWeight: 'normal', order: 12 },
];

const DEFAULT_TEACHER_FIELDS = [
  { field: 'name', label: 'Name', show: true, fontSize: 14, fontWeight: 'bold', order: 1 },
  { field: 'employeeId', label: 'Employee ID', show: true, fontSize: 12, fontWeight: 'normal', order: 2 },
  { field: 'designation', label: 'Designation', show: true, fontSize: 12, fontWeight: 'normal', order: 3 },
  { field: 'department', label: 'Department', show: true, fontSize: 12, fontWeight: 'normal', order: 4 },
  { field: 'qualification', label: 'Qualification', show: false, fontSize: 11, fontWeight: 'normal', order: 5 },
  { field: 'dateOfBirth', label: 'DOB', show: false, fontSize: 11, fontWeight: 'normal', order: 6 },
  { field: 'bloodGroup', label: 'Blood Group', show: true, fontSize: 11, fontWeight: 'normal', order: 7 },
  { field: 'contactNumber', label: 'Contact', show: true, fontSize: 11, fontWeight: 'normal', order: 8 },
  { field: 'email', label: 'Email', show: true, fontSize: 10, fontWeight: 'normal', order: 9 },
  { field: 'joiningDate', label: 'Joining Date', show: false, fontSize: 10, fontWeight: 'normal', order: 10 },
  { field: 'address', label: 'Address', show: false, fontSize: 10, fontWeight: 'normal', order: 11 },
  { field: 'emergencyContact', label: 'Emergency', show: false, fontSize: 10, fontWeight: 'normal', order: 12 },
];

const DEFAULT_STAFF_FIELDS = [
  { field: 'name', label: 'Name', show: true, fontSize: 14, fontWeight: 'bold', order: 1 },
  { field: 'employeeId', label: 'Employee ID', show: true, fontSize: 12, fontWeight: 'normal', order: 2 },
  { field: 'designation', label: 'Designation', show: true, fontSize: 12, fontWeight: 'normal', order: 3 },
  { field: 'department', label: 'Department', show: true, fontSize: 12, fontWeight: 'normal', order: 4 },
  { field: 'dateOfBirth', label: 'DOB', show: false, fontSize: 11, fontWeight: 'normal', order: 5 },
  { field: 'bloodGroup', label: 'Blood Group', show: true, fontSize: 11, fontWeight: 'normal', order: 6 },
  { field: 'contactNumber', label: 'Contact', show: true, fontSize: 11, fontWeight: 'normal', order: 7 },
  { field: 'email', label: 'Email', show: false, fontSize: 10, fontWeight: 'normal', order: 8 },
  { field: 'joiningDate', label: 'Joining Date', show: false, fontSize: 10, fontWeight: 'normal', order: 9 },
  { field: 'address', label: 'Address', show: false, fontSize: 10, fontWeight: 'normal', order: 10 },
  { field: 'emergencyContact', label: 'Emergency', show: false, fontSize: 10, fontWeight: 'normal', order: 11 },
];

// Get default fields by user type
const getDefaultFields = (userType) => {
  switch (userType) {
    case 'student':
      return DEFAULT_STUDENT_FIELDS;
    case 'teacher':
      return DEFAULT_TEACHER_FIELDS;
    case 'staff':
      return DEFAULT_STAFF_FIELDS;
    default:
      return DEFAULT_STUDENT_FIELDS;
  }
};

// Get all ID card templates
export const getTemplates = async (req, res) => {
  const { groupId, schoolId } = req.user;
  const dbClient = await getGroupDbClient(groupId);
  
  try {
    const { user_type, is_active } = req.query;
    
    let query = `
      SELECT * FROM id_card_templates 
      WHERE school_id = $1
    `;
    const params = [schoolId];
    let paramIndex = 2;
    
    if (user_type) {
      query += ` AND user_type = $${paramIndex}`;
      params.push(user_type);
      paramIndex++;
    }
    
    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      params.push(is_active === 'true');
      paramIndex++;
    }
    
    query += ' ORDER BY user_type, is_default DESC, created_at DESC';
    
    const result = await dbClient.query(query, params);
    
    res.json({
      success: true,
      data: result.rows.map(row => ({
        ...row,
        fieldsConfig: row.fields_config || [],
        backContent: row.back_content || {},
      })),
    });
  } catch (error) {
    console.error('Error fetching ID card templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ID card templates',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

// Get single template by ID
export const getTemplateById = async (req, res) => {
  const { groupId, schoolId } = req.user;
  const dbClient = await getGroupDbClient(groupId);
  
  try {
    const { id } = req.params;
    
    const result = await dbClient.query(
      'SELECT * FROM id_card_templates WHERE id = $1 AND school_id = $2',
      [id, schoolId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found',
      });
    }
    
    const template = result.rows[0];
    
    res.json({
      success: true,
      data: {
        ...template,
        fieldsConfig: template.fields_config || [],
        backContent: template.back_content || {},
      },
    });
  } catch (error) {
    console.error('Error fetching ID card template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch ID card template',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

// Create new template
export const createTemplate = async (req, res) => {
  const { groupId, schoolId, user_id } = req.user;
  const dbClient = await getGroupDbClient(groupId);
  
  try {
    const {
      name,
      userType,
      widthMm = 85.6,
      heightMm = 53.98,
      orientation = 'landscape',
      portraitLayout = 'photo-top',
      backgroundColor = '#FFFFFF',
      backgroundImageUrl,
      showHeader = true,
      headerText,
      headerFontSize = 24,
      headerFontFamily = 'Arial',
      headerFontWeight = 'bold',
      headerTextColor = '#000000',
      headerBackgroundColor,
      headerHeightMm = 10,
      showSchoolLogo = true,
      logoPosition = 'left',
      logoSizeMm = 15,
      showPhoto = true,
      photoPosition = 'left',
      photoSizeMm = 25,
      photoShape = 'rectangle',
      photoBorderColor = '#000000',
      photoBorderWidth = 1,
      // Name & Info Styling
      nameFontSize = 12,
      nameFontWeight = 'bold',
      nameTextColor = '#000000',
      nameAlignment = 'left',
      infoFontSize = 9,
      labelFontWeight = 'bold',
      labelTextColor = '#666666',
      valueFontWeight = 'normal',
      valueTextColor = '#000000',
      showLabels = true,
      infoAlignment = 'left',
      fieldsConfig,
      showBarcode = true,
      barcodeType = 'code128',
      barcodePosition = 'bottom',
      barcodeSizeMm = 30,
      barcodeHeightMm = 15,
      barcodeDataField = 'admissionNumber',
      showBarcodeText = true,
      showFooter = true,
      footerText,
      footerFontSize = 10,
      footerTextColor = '#666666',
      hasBackSide = false,
      backBackgroundColor = '#FFFFFF',
      backBackgroundImageUrl,
      backContent = {},
      showWatermark = false,
      watermarkText,
      watermarkOpacity = 0.1,
      showValidityDate = true,
      validityStartText = 'Valid From:',
      validityEndText = 'Valid Till:',
      validityDays = 365,
      showIssueDate = true,
      showEmergencyContact = false,
      showBloodGroup = true,
      showAddress = false,
      showFatherName = true,
      showMotherName = false,
      showContactNumber = true,
      showSignature = true,
      signatureLabel = 'Principal Signature',
      isActive = true,
      isDefault = false,
    } = req.body;
    
    if (!name || !userType) {
      return res.status(400).json({
        success: false,
        message: 'Name and user type are required',
      });
    }
    
    // Get default fields if not provided
    const finalFieldsConfig = fieldsConfig || getDefaultFields(userType);
    
    // If setting as default, unset other defaults for this user type
    if (isDefault) {
      await dbClient.query(
        'UPDATE id_card_templates SET is_default = false WHERE school_id = $1 AND user_type = $2',
        [schoolId, userType]
      );
    }
    
    const result = await dbClient.query(
      `INSERT INTO id_card_templates (
        name, user_type, school_id,
        width_mm, height_mm, orientation, portrait_layout, background_color, background_image_url,
        show_header, header_text, header_font_size, header_font_family, header_font_weight,
        header_text_color, header_background_color, header_height_mm,
        show_school_logo, logo_position, logo_size_mm,
        show_photo, photo_position, photo_size_mm, photo_shape, photo_border_color, photo_border_width,
        name_font_size, name_font_weight, name_text_color, name_alignment,
        info_font_size, label_font_weight, label_text_color, value_font_weight, value_text_color,
        show_labels, info_alignment,
        fields_config,
        show_barcode, barcode_type, barcode_position, barcode_size_mm, barcode_height_mm,
        barcode_data_field, show_barcode_text,
        show_footer, footer_text, footer_font_size, footer_text_color,
        has_back_side, back_background_color, back_background_image_url, back_content,
        show_watermark, watermark_text, watermark_opacity,
        show_validity_date, validity_start_text, validity_end_text, validity_days, show_issue_date,
        show_emergency_contact, show_blood_group, show_address, show_father_name, show_mother_name, show_contact_number,
        show_signature, signature_label,
        is_active, is_default, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37,
        $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, 
        $56, $57, $58, $59, $60, $61, $62, $63, $64, $65, $66, $67, $68, $69, $70, $71, $72
      ) RETURNING *`,
      [
        name, userType, schoolId,
        widthMm, heightMm, orientation, portraitLayout, backgroundColor, backgroundImageUrl,
        showHeader, headerText, headerFontSize, headerFontFamily, headerFontWeight,
        headerTextColor, headerBackgroundColor, headerHeightMm,
        showSchoolLogo, logoPosition, logoSizeMm,
        showPhoto, photoPosition, photoSizeMm, photoShape, photoBorderColor, photoBorderWidth,
        nameFontSize, nameFontWeight, nameTextColor, nameAlignment,
        infoFontSize, labelFontWeight, labelTextColor, valueFontWeight, valueTextColor,
        showLabels, infoAlignment,
        JSON.stringify(finalFieldsConfig),
        showBarcode, barcodeType, barcodePosition, barcodeSizeMm, barcodeHeightMm,
        barcodeDataField, showBarcodeText,
        showFooter, footerText, footerFontSize, footerTextColor,
        hasBackSide, backBackgroundColor, backBackgroundImageUrl, JSON.stringify(backContent),
        showWatermark, watermarkText, watermarkOpacity,
        showValidityDate, validityStartText, validityEndText, validityDays, showIssueDate,
        showEmergencyContact, showBloodGroup, showAddress, showFatherName, showMotherName, showContactNumber,
        showSignature, signatureLabel,
        isActive, isDefault, user_id
      ]
    );
    
    res.status(201).json({
      success: true,
      message: 'ID card template created successfully',
      data: {
        ...result.rows[0],
        fieldsConfig: result.rows[0].fields_config,
      },
    });
  } catch (error) {
    console.error('Error creating ID card template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create ID card template',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

// Update template
export const updateTemplate = async (req, res) => {
  const { groupId, schoolId, user_id } = req.user;
  const dbClient = await getGroupDbClient(groupId);
  
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Check if template exists
    const existingResult = await dbClient.query(
      'SELECT * FROM id_card_templates WHERE id = $1 AND school_id = $2',
      [id, schoolId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found',
      });
    }
    
    // If setting as default, unset other defaults
    if (updates.isDefault) {
      await dbClient.query(
        'UPDATE id_card_templates SET is_default = false WHERE school_id = $1 AND user_type = $2 AND id != $3',
        [schoolId, existingResult.rows[0].user_type, id]
      );
    }
    
    // Build update query dynamically
    const fieldMappings = {
      name: 'name',
      widthMm: 'width_mm',
      heightMm: 'height_mm',
      orientation: 'orientation',
      backgroundColor: 'background_color',
      backgroundImageUrl: 'background_image_url',
      showHeader: 'show_header',
      headerText: 'header_text',
      headerFontSize: 'header_font_size',
      headerFontFamily: 'header_font_family',
      headerFontWeight: 'header_font_weight',
      headerTextColor: 'header_text_color',
      headerBackgroundColor: 'header_background_color',
      headerHeightMm: 'header_height_mm',
      showSchoolLogo: 'show_school_logo',
      logoPosition: 'logo_position',
      logoSizeMm: 'logo_size_mm',
      showPhoto: 'show_photo',
      photoPosition: 'photo_position',
      photoSizeMm: 'photo_size_mm',
      photoShape: 'photo_shape',
      photoBorderColor: 'photo_border_color',
      photoBorderWidth: 'photo_border_width',
      fieldsConfig: 'fields_config',
      showBarcode: 'show_barcode',
      barcodeType: 'barcode_type',
      barcodePosition: 'barcode_position',
      barcodeSizeMm: 'barcode_size_mm',
      barcodeHeightMm: 'barcode_height_mm',
      barcodeDataField: 'barcode_data_field',
      showBarcodeText: 'show_barcode_text',
      showFooter: 'show_footer',
      footerText: 'footer_text',
      footerFontSize: 'footer_font_size',
      footerTextColor: 'footer_text_color',
      hasBackSide: 'has_back_side',
      backBackgroundColor: 'back_background_color',
      backBackgroundImageUrl: 'back_background_image_url',
      backContent: 'back_content',
      showWatermark: 'show_watermark',
      watermarkText: 'watermark_text',
      watermarkOpacity: 'watermark_opacity',
      showValidityDate: 'show_validity_date',
      validityStartText: 'validity_start_text',
      validityEndText: 'validity_end_text',
      validityDays: 'validity_days',
      showIssueDate: 'show_issue_date',
      showEmergencyContact: 'show_emergency_contact',
      showBloodGroup: 'show_blood_group',
      showAddress: 'show_address',
      showSignature: 'show_signature',
      signatureLabel: 'signature_label',
      isActive: 'is_active',
      isDefault: 'is_default',
    };
    
    const setClauses = [];
    const values = [];
    let paramIndex = 1;
    
    for (const [key, dbColumn] of Object.entries(fieldMappings)) {
      if (updates[key] !== undefined) {
        setClauses.push(`${dbColumn} = $${paramIndex}`);
        if (key === 'fieldsConfig' || key === 'backContent') {
          values.push(JSON.stringify(updates[key]));
        } else {
          values.push(updates[key]);
        }
        paramIndex++;
      }
    }
    
    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update',
      });
    }
    
    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
    setClauses.push(`updated_by = $${paramIndex}`);
    values.push(user_id);
    paramIndex++;
    
    values.push(id);
    values.push(schoolId);
    
    const result = await dbClient.query(
      `UPDATE id_card_templates SET ${setClauses.join(', ')} 
       WHERE id = $${paramIndex} AND school_id = $${paramIndex + 1} 
       RETURNING *`,
      values
    );
    
    res.json({
      success: true,
      message: 'ID card template updated successfully',
      data: {
        ...result.rows[0],
        fieldsConfig: result.rows[0].fields_config,
      },
    });
  } catch (error) {
    console.error('Error updating ID card template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update ID card template',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

// Delete template
export const deleteTemplate = async (req, res) => {
  const { groupId, schoolId } = req.user;
  const dbClient = await getGroupDbClient(groupId);
  
  try {
    const { id } = req.params;
    
    // Check if template exists and is not being used
    const existingResult = await dbClient.query(
      'SELECT * FROM id_card_templates WHERE id = $1 AND school_id = $2',
      [id, schoolId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found',
      });
    }
    
    // Check if template has been used for printing
    const printsResult = await dbClient.query(
      'SELECT COUNT(*) as count FROM id_card_prints WHERE template_id = $1',
      [id]
    );
    
    if (parseInt(printsResult.rows[0].count) > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete template that has been used for printing. Consider deactivating it instead.',
      });
    }
    
    await dbClient.query(
      'DELETE FROM id_card_templates WHERE id = $1 AND school_id = $2',
      [id, schoolId]
    );
    
    res.json({
      success: true,
      message: 'ID card template deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting ID card template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete ID card template',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

// Duplicate template
export const duplicateTemplate = async (req, res) => {
  const { groupId, schoolId, user_id } = req.user;
  const dbClient = await getGroupDbClient(groupId);
  
  try {
    const { id } = req.params;
    const { name } = req.body;
    
    // Get existing template
    const existingResult = await dbClient.query(
      'SELECT * FROM id_card_templates WHERE id = $1 AND school_id = $2',
      [id, schoolId]
    );
    
    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found',
      });
    }
    
    const template = existingResult.rows[0];
    const newName = name || `${template.name} (Copy)`;
    
    const result = await dbClient.query(
      `INSERT INTO id_card_templates (
        name, user_type, school_id,
        width_mm, height_mm, orientation, background_color, background_image_url,
        show_header, header_text, header_font_size, header_font_family, header_font_weight,
        header_text_color, header_background_color, header_height_mm,
        show_school_logo, logo_position, logo_size_mm,
        show_photo, photo_position, photo_size_mm, photo_shape, photo_border_color, photo_border_width,
        fields_config,
        show_barcode, barcode_type, barcode_position, barcode_size_mm, barcode_height_mm,
        barcode_data_field, show_barcode_text,
        show_footer, footer_text, footer_font_size, footer_text_color,
        has_back_side, back_background_color, back_background_image_url, back_content,
        show_watermark, watermark_text, watermark_opacity,
        show_validity_date, validity_start_text, validity_end_text, validity_days, show_issue_date,
        show_emergency_contact, show_blood_group, show_address, show_signature, signature_label,
        is_active, is_default, created_by
      ) SELECT
        $1, user_type, school_id,
        width_mm, height_mm, orientation, background_color, background_image_url,
        show_header, header_text, header_font_size, header_font_family, header_font_weight,
        header_text_color, header_background_color, header_height_mm,
        show_school_logo, logo_position, logo_size_mm,
        show_photo, photo_position, photo_size_mm, photo_shape, photo_border_color, photo_border_width,
        fields_config,
        show_barcode, barcode_type, barcode_position, barcode_size_mm, barcode_height_mm,
        barcode_data_field, show_barcode_text,
        show_footer, footer_text, footer_font_size, footer_text_color,
        has_back_side, back_background_color, back_background_image_url, back_content,
        show_watermark, watermark_text, watermark_opacity,
        show_validity_date, validity_start_text, validity_end_text, validity_days, show_issue_date,
        show_emergency_contact, show_blood_group, show_address, show_signature, signature_label,
        is_active, false, $2
      FROM id_card_templates WHERE id = $3
      RETURNING *`,
      [newName, user_id, id]
    );
    
    res.status(201).json({
      success: true,
      message: 'Template duplicated successfully',
      data: {
        ...result.rows[0],
        fieldsConfig: result.rows[0].fields_config,
      },
    });
  } catch (error) {
    console.error('Error duplicating template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to duplicate template',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

// Get print history
export const getPrintHistory = async (req, res) => {
  const { groupId, schoolId } = req.user;
  const dbClient = await getGroupDbClient(groupId);
  
  try {
    const { user_type, user_id, template_id, status, limit = 50, offset = 0 } = req.query;
    
    let query = `
      SELECT p.*, t.name as template_name
      FROM id_card_prints p
      LEFT JOIN id_card_templates t ON p.template_id = t.id
      WHERE p.school_id = $1
    `;
    const params = [schoolId];
    let paramIndex = 2;
    
    if (user_type) {
      query += ` AND p.user_type = $${paramIndex}`;
      params.push(user_type);
      paramIndex++;
    }
    
    if (user_id) {
      query += ` AND p.user_id = $${paramIndex}`;
      params.push(user_id);
      paramIndex++;
    }
    
    if (template_id) {
      query += ` AND p.template_id = $${paramIndex}`;
      params.push(template_id);
      paramIndex++;
    }
    
    if (status) {
      query += ` AND p.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    query += ` ORDER BY p.printed_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), parseInt(offset));
    
    const result = await dbClient.query(query, params);
    
    // Get total count
    let countQuery = `SELECT COUNT(*) FROM id_card_prints WHERE school_id = $1`;
    const countParams = [schoolId];
    
    if (user_type) {
      countQuery += ` AND user_type = $2`;
      countParams.push(user_type);
    }
    
    const countResult = await dbClient.query(countQuery, countParams);
    
    res.json({
      success: true,
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
    });
  } catch (error) {
    console.error('Error fetching print history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch print history',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

// Record a print
export const recordPrint = async (req, res) => {
  const { groupId, schoolId, user_id } = req.user;
  const dbClient = await getGroupDbClient(groupId);
  
  try {
    const { templateId, userId, userType, barcodeValue, validityStart, validityEnd, academicSessionId } = req.body;
    
    if (!templateId || !userId || !userType) {
      return res.status(400).json({
        success: false,
        message: 'Template ID, User ID, and User Type are required',
      });
    }
    
    // Check for existing active print and mark as reprinted
    await dbClient.query(
      `UPDATE id_card_prints 
       SET status = 'reprinted' 
       WHERE user_id = $1 AND user_type = $2 AND school_id = $3 AND status = 'active'`,
      [userId, userType, schoolId]
    );
    
    const result = await dbClient.query(
      `INSERT INTO id_card_prints (
        template_id, user_id, user_type, school_id, academic_session_id,
        barcode_value, validity_start, validity_end, printed_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [templateId, userId, userType, schoolId, academicSessionId, barcodeValue, validityStart, validityEnd, user_id]
    );
    
    res.status(201).json({
      success: true,
      message: 'Print recorded successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error recording print:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record print',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

// Void a print
export const voidPrint = async (req, res) => {
  const { groupId, schoolId, user_id } = req.user;
  const dbClient = await getGroupDbClient(groupId);
  
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const result = await dbClient.query(
      `UPDATE id_card_prints 
       SET status = 'void', void_reason = $1, voided_at = CURRENT_TIMESTAMP, voided_by = $2
       WHERE id = $3 AND school_id = $4
       RETURNING *`,
      [reason, user_id, id, schoolId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Print record not found',
      });
    }
    
    res.json({
      success: true,
      message: 'Print voided successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Error voiding print:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to void print',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

// Get available fields for user type
export const getAvailableFields = async (req, res) => {
  const { user_type } = req.query;
  
  const fields = getDefaultFields(user_type || 'student');
  
  res.json({
    success: true,
    data: fields,
  });
};

// Get user data for ID card generation
export const getUserDataForCard = async (req, res) => {
  const { groupId, schoolId } = req.user;
  const dbClient = await getGroupDbClient(groupId);
  
  try {
    const { userType, userIds } = req.body;
    
    if (!userType || !userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User type and user IDs are required',
      });
    }
    
    let query;
    let userData = [];
    
    switch (userType) {
      case 'student':
        query = `
          SELECT 
            s.id, s.first_name, s.last_name, s.admission_number, s.roll_number,
            s.date_of_birth, s.blood_group, s.contact_number, s.email,
            s.address, s.city, s.state, s.pincode, s.photo_url,
            s.emergency_contact_name, s.emergency_contact_phone,
            c.name as class_name, sec.name as section_name,
            p_father.first_name || ' ' || p_father.last_name as father_name,
            p_mother.first_name || ' ' || p_mother.last_name as mother_name,
            COALESCE(p_father.phone, p_mother.phone) as parent_contact
          FROM students s
          LEFT JOIN classes c ON s.class_id = c.id
          LEFT JOIN sections sec ON s.section_id = sec.id
          LEFT JOIN student_parents sp_father ON s.id = sp_father.student_id AND sp_father.relationship = 'father'
          LEFT JOIN parents p_father ON sp_father.parent_id = p_father.id
          LEFT JOIN student_parents sp_mother ON s.id = sp_mother.student_id AND sp_mother.relationship = 'mother'
          LEFT JOIN parents p_mother ON sp_mother.parent_id = p_mother.id
          WHERE s.id = ANY($1) AND s.school_id = $2
        `;
        const studentResult = await dbClient.query(query, [userIds, schoolId]);
        userData = studentResult.rows.map(row => ({
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          admissionNumber: row.admission_number,
          rollNumber: row.roll_number,
          class: row.class_name,
          section: row.section_name,
          dateOfBirth: row.date_of_birth,
          bloodGroup: row.blood_group,
          contactNumber: row.contact_number || row.parent_contact,
          email: row.email,
          address: [row.address, row.city, row.state, row.pincode].filter(Boolean).join(', '),
          photoUrl: row.photo_url,
          fatherName: row.father_name,
          motherName: row.mother_name,
          emergencyContact: row.emergency_contact_phone,
          emergencyContactName: row.emergency_contact_name,
        }));
        break;
        
      case 'teacher':
        query = `
          SELECT 
            t.id, t.first_name, t.last_name, t.employee_id, t.designation,
            t.date_of_birth, t.blood_group, t.contact_number, t.email,
            t.address, t.city, t.state, t.pincode, t.photo_url,
            t.emergency_contact_name, t.emergency_contact_phone,
            t.qualification, t.date_of_joining,
            d.name as department_name
          FROM teachers t
          LEFT JOIN departments d ON t.department_id = d.id
          WHERE t.id = ANY($1) AND t.school_id = $2
        `;
        const teacherResult = await dbClient.query(query, [userIds, schoolId]);
        userData = teacherResult.rows.map(row => ({
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          employeeId: row.employee_id,
          designation: row.designation,
          department: row.department_name,
          qualification: row.qualification,
          dateOfBirth: row.date_of_birth,
          bloodGroup: row.blood_group,
          contactNumber: row.contact_number,
          email: row.email,
          address: [row.address, row.city, row.state, row.pincode].filter(Boolean).join(', '),
          photoUrl: row.photo_url,
          joiningDate: row.date_of_joining,
          emergencyContact: row.emergency_contact_phone,
          emergencyContactName: row.emergency_contact_name,
        }));
        break;
        
      case 'staff':
        query = `
          SELECT 
            sm.id, sm.first_name, sm.last_name, sm.employee_id, sm.designation,
            sm.date_of_birth, sm.blood_group, sm.phone, sm.email,
            sm.address, sm.photo_url,
            sm.emergency_contact_name, sm.emergency_contact_phone,
            sm.date_of_joining, sm.department
          FROM staff_members sm
          WHERE sm.id = ANY($1) AND sm.school_id = $2
        `;
        const staffResult = await dbClient.query(query, [userIds, schoolId]);
        userData = staffResult.rows.map(row => ({
          id: row.id,
          name: `${row.first_name} ${row.last_name}`.trim(),
          employeeId: row.employee_id,
          designation: row.designation,
          department: row.department,
          dateOfBirth: row.date_of_birth,
          bloodGroup: row.blood_group,
          contactNumber: row.phone,
          email: row.email,
          address: row.address,
          photoUrl: row.photo_url,
          joiningDate: row.date_of_joining,
          emergencyContact: row.emergency_contact_phone,
          emergencyContactName: row.emergency_contact_name,
        }));
        break;
        
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid user type',
        });
    }
    
    res.json({
      success: true,
      data: userData,
    });
  } catch (error) {
    console.error('Error fetching user data for ID card:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user data',
      error: error.message,
    });
  } finally {
    await dbClient.end();
  }
};

export default {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
  getPrintHistory,
  recordPrint,
  voidPrint,
  getAvailableFields,
  getUserDataForCard,
};

