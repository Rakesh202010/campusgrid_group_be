import { Client } from 'pg';
import prismaAdmin from '../lib/prisma.js';

/**
 * Migration to add ID card configuration tables
 */
export async function migrateIdCardConfig() {
  console.log('Starting ID card configuration migration...\n');

  try {
    // Get all active school groups
    const groups = await prismaAdmin.schoolGroup.findMany({
      where: { status: { in: ['Active', 'active'] } },
      select: { id: true, dbName: true, dbHost: true, dbUser: true, dbPassword: true },
    });

    if (groups.length === 0) {
      console.log('No active school groups found.');
      return;
    }

    for (const group of groups) {
      console.log(`Migrating database: ${group.dbName}`);

      const dbClient = new Client({
        host: group.dbHost === 'localhost' ? 'postgres_schools' : group.dbHost,
        port: 5432,
        user: group.dbUser,
        password: group.dbPassword,
        database: group.dbName,
      });

      try {
        await dbClient.connect();

        // Create id_card_templates table
        await dbClient.query(`
          CREATE TABLE IF NOT EXISTS id_card_templates (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(100) NOT NULL,
            user_type VARCHAR(50) NOT NULL, -- student, teacher, staff
            school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
            
            -- Layout Configuration
            width_mm DECIMAL(10,2) DEFAULT 85.6, -- Standard ID card width
            height_mm DECIMAL(10,2) DEFAULT 53.98, -- Standard ID card height
            orientation VARCHAR(20) DEFAULT 'landscape', -- landscape, portrait
            background_color VARCHAR(20) DEFAULT '#FFFFFF',
            background_image_url VARCHAR(500),
            
            -- Header Configuration
            show_header BOOLEAN DEFAULT true,
            header_text VARCHAR(200),
            header_font_size INTEGER DEFAULT 24,
            header_font_family VARCHAR(100) DEFAULT 'Arial',
            header_font_weight VARCHAR(20) DEFAULT 'bold',
            header_text_color VARCHAR(20) DEFAULT '#000000',
            header_background_color VARCHAR(20),
            header_height_mm DECIMAL(10,2) DEFAULT 10,
            show_school_logo BOOLEAN DEFAULT true,
            logo_position VARCHAR(20) DEFAULT 'left', -- left, center, right
            logo_size_mm DECIMAL(10,2) DEFAULT 15,
            
            -- Photo Configuration
            show_photo BOOLEAN DEFAULT true,
            photo_position VARCHAR(20) DEFAULT 'left', -- left, right, center
            photo_size_mm DECIMAL(10,2) DEFAULT 25,
            photo_shape VARCHAR(20) DEFAULT 'rectangle', -- rectangle, circle, rounded
            photo_border_color VARCHAR(20) DEFAULT '#000000',
            photo_border_width DECIMAL(5,2) DEFAULT 1,
            
            -- Fields Configuration (JSONB for flexible field configuration)
            fields_config JSONB DEFAULT '[]'::jsonb,
            
            -- Barcode/QR Code Configuration
            show_barcode BOOLEAN DEFAULT true,
            barcode_type VARCHAR(20) DEFAULT 'code128', -- code128, qrcode, ean13, code39
            barcode_position VARCHAR(20) DEFAULT 'bottom', -- top, bottom, left, right
            barcode_size_mm DECIMAL(10,2) DEFAULT 30,
            barcode_height_mm DECIMAL(10,2) DEFAULT 15,
            barcode_data_field VARCHAR(50) DEFAULT 'admissionNumber', -- Which field to encode
            show_barcode_text BOOLEAN DEFAULT true,
            
            -- Footer Configuration
            show_footer BOOLEAN DEFAULT true,
            footer_text VARCHAR(200),
            footer_font_size INTEGER DEFAULT 10,
            footer_text_color VARCHAR(20) DEFAULT '#666666',
            
            -- Back Side Configuration
            has_back_side BOOLEAN DEFAULT false,
            back_background_color VARCHAR(20) DEFAULT '#FFFFFF',
            back_background_image_url VARCHAR(500),
            back_content JSONB DEFAULT '{}'::jsonb,
            
            -- Security Features
            show_watermark BOOLEAN DEFAULT false,
            watermark_text VARCHAR(100),
            watermark_opacity DECIMAL(3,2) DEFAULT 0.1,
            show_validity_date BOOLEAN DEFAULT true,
            validity_start_text VARCHAR(50) DEFAULT 'Valid From:',
            validity_end_text VARCHAR(50) DEFAULT 'Valid Till:',
            validity_days INTEGER DEFAULT 365,
            show_issue_date BOOLEAN DEFAULT true,
            
            -- Additional Options
            show_emergency_contact BOOLEAN DEFAULT false,
            show_blood_group BOOLEAN DEFAULT true,
            show_address BOOLEAN DEFAULT false,
            show_signature BOOLEAN DEFAULT true,
            signature_label VARCHAR(50) DEFAULT 'Principal Signature',
            
            -- Status
            is_active BOOLEAN DEFAULT true,
            is_default BOOLEAN DEFAULT false,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_by UUID,
            updated_by UUID
          );
        `);

        // Create id_card_prints table (track printing history)
        await dbClient.query(`
          CREATE TABLE IF NOT EXISTS id_card_prints (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            template_id UUID REFERENCES id_card_templates(id) ON DELETE SET NULL,
            user_id UUID NOT NULL,
            user_type VARCHAR(50) NOT NULL, -- student, teacher, staff
            school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
            academic_session_id UUID,
            printed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            printed_by UUID,
            print_count INTEGER DEFAULT 1,
            barcode_value VARCHAR(255),
            validity_start DATE,
            validity_end DATE,
            status VARCHAR(20) DEFAULT 'active', -- active, reprinted, void, expired
            void_reason VARCHAR(255),
            voided_at TIMESTAMP,
            voided_by UUID
          );
        `);

        // Create indexes
        await dbClient.query(`
          CREATE INDEX IF NOT EXISTS idx_id_card_templates_school ON id_card_templates(school_id);
          CREATE INDEX IF NOT EXISTS idx_id_card_templates_user_type ON id_card_templates(user_type);
          CREATE INDEX IF NOT EXISTS idx_id_card_templates_active ON id_card_templates(is_active);
          CREATE INDEX IF NOT EXISTS idx_id_card_prints_school ON id_card_prints(school_id);
          CREATE INDEX IF NOT EXISTS idx_id_card_prints_user ON id_card_prints(user_id, user_type);
          CREATE INDEX IF NOT EXISTS idx_id_card_prints_template ON id_card_prints(template_id);
          CREATE INDEX IF NOT EXISTS idx_id_card_prints_status ON id_card_prints(status);
        `);

        console.log(`  ✓ Migration completed for ${group.dbName}\n`);
      } catch (error) {
        console.error(`  ✗ Error migrating ${group.dbName}:`, error.message);
      } finally {
        await dbClient.end();
      }
    }

    console.log('ID card configuration migration completed!\n');
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateIdCardConfig()
    .then(() => {
      console.log('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

