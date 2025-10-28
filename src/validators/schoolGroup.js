import { body } from 'express-validator';

export const validateSchoolGroup = [
  // Organization Details
  body('groupName')
    .trim()
    .notEmpty().withMessage('Group name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Group name must be between 2 and 100 characters'),
  
  body('displayName')
    .trim()
    .notEmpty().withMessage('Display name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Display name must be between 2 and 100 characters'),
  
  body('organizationType')
    .trim()
    .notEmpty().withMessage('Organization type is required')
    .isIn(['Trust', 'Society', 'Private Limited', 'Government', 'University', 'NGO'])
    .withMessage('Invalid organization type'),
  
  body('affiliatedBoards')
    .isArray({ min: 1 }).withMessage('At least one affiliated board is required'),
  
  body('affiliatedBoards.*')
    .isString().withMessage('Affiliated boards must be strings'),
  
  body('establishedYear')
    .isInt({ min: 1800, max: new Date().getFullYear() })
    .withMessage('Invalid established year'),
  
  body('registrationNumber')
    .trim()
    .notEmpty().withMessage('Registration number is required'),
  
  body('domainName')
    .trim()
    .notEmpty().withMessage('Domain name is required')
    .matches(/^[a-z0-9-]+\.[a-z0-9.-]+$/).withMessage('Invalid domain name format'),
  
  body('subdomain')
    .trim()
    .notEmpty().withMessage('Subdomain is required')
    .isLowercase().withMessage('Subdomain must be lowercase')
    .matches(/^[a-z0-9-]+$/).withMessage('Invalid subdomain format')
    .isLength({ min: 2, max: 50 }).withMessage('Subdomain must be between 2 and 50 characters'),
  
  body('planType')
    .trim()
    .isIn(['Free', 'Standard', 'Enterprise']).withMessage('Invalid plan type'),
  
  body('paymentMode')
    .trim()
    .isIn(['Online', 'Invoice', 'UPI', 'NEFT']).withMessage('Invalid payment mode'),
  
  // Contact & Address Details
  body('contactPerson')
    .trim()
    .notEmpty().withMessage('Contact person name is required'),
  
  body('contactEmail')
    .trim()
    .notEmpty().withMessage('Contact email is required')
    .isEmail().withMessage('Invalid email format'),
  
  body('contactPhone')
    .trim()
    .notEmpty().withMessage('Contact phone is required')
    .matches(/^[0-9]{10}$/).withMessage('Phone must be 10 digits'),
  
  body('addressLine1')
    .trim()
    .notEmpty().withMessage('Address line 1 is required'),
  
  body('city')
    .trim()
    .notEmpty().withMessage('City is required'),
  
  body('state')
    .trim()
    .notEmpty().withMessage('State is required'),
  
  body('pincode')
    .trim()
    .notEmpty().withMessage('Pincode is required')
    .matches(/^[0-9]{6}$/).withMessage('Pincode must be 6 digits'),
  
  body('country')
    .optional()
    .trim()
    .default('India'),
  
  body('timezone')
    .optional()
    .trim()
    .default('Asia/Kolkata'),
  
  body('preferredLanguage')
    .optional()
    .trim()
    .default('English'),
  
  // Compliance & Finance
  body('panNumber')
    .trim()
    .notEmpty().withMessage('PAN number is required')
    .matches(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/).withMessage('Invalid PAN number format'),
  
  body('gstNumber')
    .trim()
    .notEmpty().withMessage('GST number is required')
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/)
    .withMessage('Invalid GST number format'),
  
  body('bankName')
    .trim()
    .notEmpty().withMessage('Bank name is required'),
  
  body('accountHolderName')
    .trim()
    .notEmpty().withMessage('Account holder name is required'),
  
  body('accountNumber')
    .trim()
    .notEmpty().withMessage('Account number is required')
    .isLength({ min: 8, max: 20 }).withMessage('Account number must be between 8 and 20 characters'),
  
  body('ifscCode')
    .trim()
    .notEmpty().withMessage('IFSC code is required')
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage('Invalid IFSC code format'),
  
  body('billingEmail')
    .trim()
    .notEmpty().withMessage('Billing email is required')
    .isEmail().withMessage('Invalid billing email format'),
  
  // Optional fields
  body('altPhone').optional().matches(/^[0-9]{10}$/).withMessage('Alt phone must be 10 digits'),
  body('noOfSchools').optional().isInt({ min: 1 }).withMessage('Number of schools must be a positive integer'),
  body('registrationCertificateUrl').optional().isURL().withMessage('Invalid certificate URL'),
  body('logoUrl').optional().isURL().withMessage('Invalid logo URL'),
  body('remarks').optional().trim(),
];
